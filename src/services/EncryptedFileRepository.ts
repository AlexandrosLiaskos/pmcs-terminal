import * as fs from 'fs-extra';
import * as path from 'path';
import { GitService } from './GitService';
import { CryptoService } from './CryptoService';
import { KeyManager } from './KeyManager';
import { AuthenticationService } from './AuthenticationService';
import { 
  Repository, 
  BaseEntity, 
  CorporateLevel, 
  Classification
} from '../types';

type ClassificationLevel = Classification;

export interface EncryptedFileOptions {
  organizationId?: string;
  classification?: ClassificationLevel;
  corporateLevel?: CorporateLevel;
  autoEncrypt?: boolean;
}

export class EncryptedFileRepository<T extends BaseEntity> implements Repository<T> {
  private cryptoService: CryptoService;
  private keyManager: KeyManager;
  
  constructor(
    private entityType: string,
    private gitService: GitService,
    private authService: AuthenticationService,
    private encryptedOptions: EncryptedFileOptions = {}
  ) {
    this.cryptoService = new CryptoService(authService);
    this.keyManager = new KeyManager(authService);
  }

  async initialize(): Promise<void> {
    await this.cryptoService.initialize();
    await this.keyManager.initialize();
    
    const entityDir = this.getEntityDirectory();
    await fs.ensureDir(entityDir);
  }

  async create(entityData: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const session = await this.authService.getCurrentSession();
    
    const entity: T = {
      ...entityData,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: session.user.id,
      version: '1.0.0'
    } as T;

    const entityPath = this.getEntityPath(entity.id);
    
    await this.writeEntityFile(entity, entityPath);
    
    if (this.encryptedOptions.autoEncrypt !== false) {
      await this.encryptEntityFile(entityPath, entity.id);
    }
    
    return entity;
  }

  async findById(id: string): Promise<T | null> {
    const entityPath = this.getEntityPath(id);
    const encryptedPath = `${entityPath}.encrypted`;
    
    let filePath = entityPath;
    if (await fs.pathExists(encryptedPath)) {
      filePath = await this.decryptEntityFile(encryptedPath, id);
    } else if (!await fs.pathExists(entityPath)) {
      return null;
    }
    
    try {
      const entity = await fs.readJSON(filePath);
      
      if (await fs.pathExists(encryptedPath) && filePath !== entityPath) {
        await fs.remove(filePath);
      }
      
      return entity;
    } catch {
      return null;
    }
  }

  async findAll(): Promise<T[]> {
    const entityDir = this.getEntityDirectory();
    
    if (!await fs.pathExists(entityDir)) {
      return [];
    }
    
    const files = await fs.readdir(entityDir);
    const entities: T[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.json.encrypted')) {
        const id = file.replace('.json.encrypted', '').replace('.json', '');
        const entity = await this.findById(id);
        if (entity) {
          entities.push(entity);
        }
      }
    }
    
    return entities;
  }

  async update(id: string, updateData: Partial<T>): Promise<T> {
    const existingEntity = await this.findById(id);
    if (!existingEntity) {
      throw new Error(`${this.entityType} with ID '${id}' not found`);
    }
    
    const session = await this.authService.getCurrentSession();
    
    const updatedEntity: T = {
      ...existingEntity,
      ...updateData,
      id,
      updatedAt: new Date(),
      updatedBy: session.user.id,
      version: this.incrementVersion(existingEntity.version)
    };
    
    const entityPath = this.getEntityPath(id);
    const encryptedPath = `${entityPath}.encrypted`;
    
    if (await fs.pathExists(encryptedPath)) {
      await fs.remove(encryptedPath);
    }
    
    await this.writeEntityFile(updatedEntity, entityPath);
    
    if (this.encryptedOptions.autoEncrypt !== false) {
      await this.encryptEntityFile(entityPath, id);
    }
    
    return updatedEntity;
  }

  async delete(id: string): Promise<void> {
    const entityPath = this.getEntityPath(id);
    const encryptedPath = `${entityPath}.encrypted`;
    
    if (await fs.pathExists(encryptedPath)) {
      await fs.remove(encryptedPath);
      this.gitService.addToTransaction(encryptedPath);
    }
    
    if (await fs.pathExists(entityPath)) {
      await fs.remove(entityPath);
      this.gitService.addToTransaction(entityPath);
    }
  }

  async findByEntity?(entityType: string, entityId: string): Promise<T[]> {
    const allEntities = await this.findAll();
    return allEntities.filter((entity: any) => 
      entity.entityType === entityType && entity.entityId === entityId
    );
  }

  async findAllUserVisible(userId: string): Promise<T[]> {
    const session = await this.authService.getCurrentSession();
    const allEntities = await this.findAll();
    
    return allEntities.filter(entity => {
      return this.canUserAccessEntity(entity, session.user.id);
    });
  }

  async encryptAllFiles(): Promise<string[]> {
    const entityDir = this.getEntityDirectory();
    const encryptedFiles: string[] = [];
    
    if (!await fs.pathExists(entityDir)) {
      return encryptedFiles;
    }
    
    const files = await fs.readdir(entityDir);
    
    for (const file of files) {
      if (file.endsWith('.json') && !file.endsWith('.encrypted')) {
        const filePath = path.join(entityDir, file);
        
        try {
          const encryptedPath = await this.cryptoService.encryptFile(
            filePath,
            this.encryptedOptions.organizationId,
            this.encryptedOptions.classification,
            this.encryptedOptions.corporateLevel
          );
          
          encryptedFiles.push(encryptedPath);
          this.gitService.addToTransaction(encryptedPath);
        } catch (error: any) {
          console.warn(`Warning: Could not encrypt ${filePath}: ${error.message}`);
        }
      }
    }
    
    return encryptedFiles;
  }

  async decryptAllFiles(): Promise<string[]> {
    const entityDir = this.getEntityDirectory();
    const decryptedFiles: string[] = [];
    
    if (!await fs.pathExists(entityDir)) {
      return decryptedFiles;
    }
    
    const files = await fs.readdir(entityDir);
    
    for (const file of files) {
      if (file.endsWith('.json.encrypted')) {
        const encryptedPath = path.join(entityDir, file);
        
        try {
          const decryptedPath = await this.cryptoService.decryptFile(encryptedPath);
          decryptedFiles.push(decryptedPath);
        } catch (error: any) {
          console.warn(`Warning: Could not decrypt ${encryptedPath}: ${error.message}`);
        }
      }
    }
    
    return decryptedFiles;
  }

  async getEncryptionStatus(): Promise<{
    totalFiles: number;
    encryptedFiles: number;
    unencryptedFiles: number;
    encryptionPercentage: number;
  }> {
    const entityDir = this.getEntityDirectory();
    
    if (!await fs.pathExists(entityDir)) {
      return {
        totalFiles: 0,
        encryptedFiles: 0,
        unencryptedFiles: 0,
        encryptionPercentage: 0
      };
    }
    
    const files = await fs.readdir(entityDir);
    const jsonFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.json.encrypted'));
    
    const encryptedFiles = files.filter(f => f.endsWith('.json.encrypted')).length;
    const unencryptedFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.encrypted')).length;
    const totalFiles = jsonFiles.length;
    
    return {
      totalFiles,
      encryptedFiles,
      unencryptedFiles,
      encryptionPercentage: totalFiles > 0 ? (encryptedFiles / totalFiles) * 100 : 0
    };
  }

  async startDecryptionSession(): Promise<void> {
    const session = await this.authService.getCurrentSession();
    await this.cryptoService.startDecryptionSession(session.user.id);
  }

  async endDecryptionSession(): Promise<void> {
    const session = await this.authService.getCurrentSession();
    await this.cryptoService.endDecryptionSession(session.user.id);
  }

  async migrateToEncryption(): Promise<{
    migrated: string[];
    errors: Array<{ file: string; error: string }>;
  }> {
    const entityDir = this.getEntityDirectory();
    const migrated: string[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    
    if (!await fs.pathExists(entityDir)) {
      return { migrated, errors };
    }
    
    const files = await fs.readdir(entityDir);
    const unencryptedFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.encrypted'));
    
    for (const file of unencryptedFiles) {
      const filePath = path.join(entityDir, file);
      
      try {
        const entity = await fs.readJSON(filePath);
        const id = entity.id || file.replace('.json', '');
        
        await this.encryptEntityFile(filePath, id);
        migrated.push(filePath);
      } catch (error: any) {
        errors.push({
          file: filePath,
          error: error.message
        });
      }
    }
    
    return { migrated, errors };
  }

  private async writeEntityFile(entity: T, entityPath: string): Promise<void> {
    await fs.ensureDir(path.dirname(entityPath));
    
    const entityWithMetadata = {
      ...entity,
      entityType: this.entityType,
      lastModified: new Date().toISOString(),
      encryptionReady: true
    };
    
    await fs.writeJSON(entityPath, entityWithMetadata, { spaces: 2 });
    this.gitService.addToTransaction(entityPath);
  }

  private async encryptEntityFile(entityPath: string, entityId: string): Promise<void> {
    if (!await fs.pathExists(entityPath)) {
      throw new Error(`Entity file not found: ${entityPath}`);
    }
    
    const encryptedPath = await this.cryptoService.encryptFile(
      entityPath,
      this.encryptedOptions.organizationId,
      this.encryptedOptions.classification || Classification.UNCLASSIFIED,
      this.encryptedOptions.corporateLevel || CorporateLevel.MEMBER
    );
    
    this.gitService.addToTransaction(encryptedPath);
  }

  private async decryptEntityFile(encryptedPath: string, entityId: string): Promise<string> {
    const session = await this.authService.getCurrentSession();
    
    const metadata = await this.cryptoService.getFileMetadata(encryptedPath);
    if (!metadata) {
      throw new Error(`Invalid encrypted file: ${encryptedPath}`);
    }
    
    if (!await this.keyManager.validateUserKeyAccess(
      session.user.id,
      metadata.organizationId,
      metadata.classification,
      metadata.corporateLevel
    )) {
      throw new Error(`Access denied to decrypt entity: ${entityId}`);
    }
    
    return await this.cryptoService.decryptFile(encryptedPath);
  }

  private getEntityDirectory(): string {
    if (this.encryptedOptions.organizationId) {
      return `organizations/${this.encryptedOptions.organizationId}/${this.entityType}s`;
    }
    return `${this.entityType}s`;
  }

  private getEntityPath(id: string): string {
    return path.join(this.getEntityDirectory(), `${id}.json`);
  }

  private generateId(): string {
    return `${this.entityType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  private applyListFilters(entities: T[], options?: any): T[] {
    if (!options) return entities;
    
    let filtered = entities;
    
    if (options.status) {
      filtered = filtered.filter((entity: any) => entity.status === options.status);
    }
    
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  }

  private canUserAccessEntity(entity: T, userId: string): boolean {
    const entityAny = entity as any;
    
    if (entityAny.createdBy === userId) {
      return true;
    }
    
    if (!this.encryptedOptions.organizationId) {
      return true;
    }
    
    return true;
  }
}