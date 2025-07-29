import * as fs from 'fs-extra';
import * as path from 'path';
import { createId } from '@paralleldrive/cuid2';
import { Repository, BaseEntity } from '../types';
import { GitService } from './GitService';

export class FileBasedRepository<T extends BaseEntity> implements Repository<T> {
  private baseDir: string;
  private gitService: GitService;
  private entityType: string;

  constructor(baseDir: string, gitService: GitService, entityType: string) {
    this.baseDir = baseDir;
    this.gitService = gitService;
    this.entityType = entityType;
  }

  async create(entityData: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const id = createId();
    const now = new Date();
    
    const entity: T = {
      ...entityData,
      id,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0'
    } as T;

    const filePath = this.getEntityFilePath(id);
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(filePath));
    
    // Write entity to file
    await fs.writeJSON(filePath, {
      ...entity,
      entityType: this.entityType,
      lastModified: now.toISOString()
    }, { spaces: 2 });

    // Add to git transaction if active
    this.gitService.addToTransaction(filePath);

    return entity;
  }

  async findById(id: string): Promise<T | null> {
    const filePath = this.getEntityFilePath(id);
    
    if (!await fs.pathExists(filePath)) {
      return null;
    }

    try {
      const data = await fs.readJSON(filePath);
      
      // Convert ISO strings back to Date objects
      if (data.createdAt) data.createdAt = new Date(data.createdAt);
      if (data.updatedAt) data.updatedAt = new Date(data.updatedAt);
      if (data.dueDate) data.dueDate = new Date(data.dueDate);
      if (data.publishAt) data.publishAt = new Date(data.publishAt);
      if (data.publishedAt) data.publishedAt = new Date(data.publishedAt);
      
      return data as T;
    } catch (error: any) {
      console.warn(`Failed to read entity ${id}:`, error.message);
      return null;
    }
  }

  async findAll(): Promise<T[]> {
    const entities: T[] = [];
    
    if (!await fs.pathExists(this.baseDir)) {
      return entities;
    }

    try {
      await this.walkDirectory(this.baseDir, async (filePath) => {
        if (path.extname(filePath) === '.json' && !filePath.includes('README')) {
          try {
            const entity = await this.loadEntityFromFile(filePath);
            if (entity) {
              entities.push(entity);
            }
          } catch (error: any) {
            console.warn(`Failed to load entity from ${filePath}:`, error.message);
          }
        }
      });
    } catch (error: any) {
      console.warn(`Failed to scan directory ${this.baseDir}:`, error.message);
    }

    return entities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Entity with id ${id} not found`);
    }

    const updated: T = {
      ...existing,
      ...updates,
      id: existing.id, // Ensure ID cannot be changed
      createdAt: existing.createdAt, // Ensure createdAt cannot be changed
      updatedAt: new Date()
    };

    const filePath = this.getEntityFilePath(id);
    
    await fs.writeJSON(filePath, {
      ...updated,
      entityType: this.entityType,
      lastModified: updated.updatedAt.toISOString()
    }, { spaces: 2 });

    // Add to git transaction if active
    this.gitService.addToTransaction(filePath);

    return updated;
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getEntityFilePath(id);
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Entity with id ${id} not found`);
    }

    await fs.remove(filePath);
    
    // Add to git transaction if active
    this.gitService.addToTransaction(filePath);
  }

  async findAllUserVisible(userId: string): Promise<T[]> {
    // For now, return all entities
    // In a real implementation, this would filter based on user permissions
    return await this.findAll();
  }

  // Repository-specific methods

  async findByOrganizationId(organizationId: string): Promise<T[]> {
    const entities = await this.findAll();
    return entities.filter((entity: any) => 
      entity.organizationId === organizationId
    );
  }

  async findByStatus(status: string): Promise<T[]> {
    const entities = await this.findAll();
    return entities.filter((entity: any) => 
      entity.status === status
    );
  }

  async findByAssignee(assigneeEmail: string): Promise<T[]> {
    const entities = await this.findAll();
    return entities.filter((entity: any) => 
      entity.assigneeEmail === assigneeEmail
    );
  }

  async findByAssigner(assignerEmail: string): Promise<T[]> {
    const entities = await this.findAll();
    return entities.filter((entity: any) => 
      entity.assignerEmail === assignerEmail
    );
  }

  async findByEntity(entityType: string, entityId: string): Promise<T[]> {
    const entities = await this.findAll();
    return entities.filter((entity: any) => 
      entity.entityType === entityType && entity.entityId === entityId
    );
  }

  async getMemberCount(entityId: string): Promise<number> {
    // This would need to be implemented based on specific entity relationships
    // For now, return a placeholder
    return 0;
  }

  async getMembers(entityId: string): Promise<any[]> {
    // This would need to be implemented based on specific entity relationships
    // For now, return empty array
    return [];
  }

  // Private helper methods

  private getEntityFilePath(id: string): string {
    // For organizations, store directly in the base directory
    if (this.entityType === 'organization') {
      return path.join(this.baseDir, id, `${this.entityType}.json`);
    }
    
    // For other entities, create a flat structure for now
    // In a full implementation, this would respect the hierarchy
    return path.join(this.baseDir, `${id}.json`);
  }

  private async loadEntityFromFile(filePath: string): Promise<T | null> {
    try {
      const data = await fs.readJSON(filePath);
      
      // Convert ISO strings back to Date objects
      if (data.createdAt) data.createdAt = new Date(data.createdAt);
      if (data.updatedAt) data.updatedAt = new Date(data.updatedAt);
      if (data.dueDate) data.dueDate = new Date(data.dueDate);
      if (data.publishAt) data.publishAt = new Date(data.publishAt);
      if (data.publishedAt) data.publishedAt = new Date(data.publishedAt);
      
      return data as T;
    } catch (error: any) {
      return null;
    }
  }

  private async walkDirectory(
    dir: string, 
    callback: (filePath: string) => Promise<void>
  ): Promise<void> {
    const items = await fs.readdir(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        await this.walkDirectory(fullPath, callback);
      } else {
        await callback(fullPath);
      }
    }
  }

  // Indexing support for performance
  async buildIndex(): Promise<void> {
    const entities = await this.findAll();
    const index = {
      entityType: this.entityType,
      totalCount: entities.length,
      lastUpdated: new Date().toISOString(),
      entities: entities.map(entity => ({
        id: entity.id,
        createdAt: entity.createdAt.toISOString(),
        // Add other commonly queried fields
        ...(entity as any).name && { name: (entity as any).name },
        ...(entity as any).title && { title: (entity as any).title },
        ...(entity as any).status && { status: (entity as any).status },
        ...(entity as any).organizationId && { organizationId: (entity as any).organizationId }
      }))
    };

    const indexPath = path.join('indexes', `${this.entityType}.json`);
    await fs.ensureDir('indexes');
    await fs.writeJSON(indexPath, index, { spaces: 2 });
  }
}