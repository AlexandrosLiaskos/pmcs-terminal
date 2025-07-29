import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AuthenticationService } from './AuthenticationService';
import { CorporateLevel, Classification, SystemRole } from '../types';

type ClassificationLevel = Classification;

export interface EncryptionMetadata {
  algorithm: string;
  version: string;
  fileType: string;
  originalSize: number;
  encryptedAt: Date;
  encryptedBy: string;
  organizationId?: string;
  classification: ClassificationLevel;
  corporateLevel: CorporateLevel;
  iv: string;
  authTag: string;
  keyDerivationInfo: {
    salt: string;
    iterations: number;
    keyLength: number;
  };
}

export interface EncryptedFile {
  metadata: EncryptionMetadata;
  encryptedData: Buffer;
}

export interface DecryptionSession {
  userId: string;
  sessionKey: Buffer;
  derivedKeys: Map<string, Buffer>;
  expiresAt: Date;
  organizationKeys: Map<string, Buffer>;
}

export class CryptoService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;
  private readonly IV_LENGTH = 16;
  private readonly SALT_LENGTH = 32;
  private readonly TAG_LENGTH = 16;
  private readonly PBKDF2_ITERATIONS = 100000;
  private readonly SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours
  
  private activeSessions: Map<string, DecryptionSession> = new Map();
  private masterKeyPath = '.pmcs/encryption/master.key';
  private sessionKeyPath = '.pmcs/encryption/session.key';

  constructor(private authService: AuthenticationService) {}

  async initialize(): Promise<void> {
    await fs.ensureDir('.pmcs/encryption');
    
    if (!await fs.pathExists(this.masterKeyPath)) {
      await this.generateMasterKey();
    }
  }

  async encryptFile(
    filePath: string,
    organizationId?: string,
    classification: ClassificationLevel = Classification.UNCLASSIFIED,
    corporateLevel: CorporateLevel = CorporateLevel.MEMBER
  ): Promise<string> {
    const session = await this.authService.getCurrentSession();
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileBuffer = await fs.readFile(filePath);
    const fileStats = await fs.stat(filePath);
    const fileExtension = path.extname(filePath);
    const fileName = path.basename(filePath);
    
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    
    const derivedKey = await this.deriveFileKey(
      session.user.id,
      organizationId,
      classification,
      corporateLevel,
      salt
    );
    
    const cipher = crypto.createCipher(this.ALGORITHM, derivedKey);
    cipher.setAAD(Buffer.from(JSON.stringify({
      userId: session.user.id,
      organizationId,
      classification,
      corporateLevel,
      fileName
    })));
    
    const encryptedData = Buffer.concat([
      cipher.update(fileBuffer),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    const metadata: EncryptionMetadata = {
      algorithm: this.ALGORITHM,
      version: '1.0.0',
      fileType: fileExtension || 'unknown',
      originalSize: fileStats.size,
      encryptedAt: new Date(),
      encryptedBy: session.user.id,
      organizationId,
      classification,
      corporateLevel,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyDerivationInfo: {
        salt: salt.toString('hex'),
        iterations: this.PBKDF2_ITERATIONS,
        keyLength: this.KEY_LENGTH
      }
    };
    
    const encryptedFile: EncryptedFile = {
      metadata,
      encryptedData
    };
    
    const encryptedPath = `${filePath}.encrypted`;
    await fs.writeFile(encryptedPath, JSON.stringify({
      metadata,
      data: encryptedData.toString('base64')
    }, null, 2));
    
    await fs.remove(filePath);
    
    return encryptedPath;
  }

  async decryptFile(encryptedPath: string, outputPath?: string): Promise<string> {
    const session = await this.authService.getCurrentSession();
    
    if (!await fs.pathExists(encryptedPath)) {
      throw new Error(`Encrypted file not found: ${encryptedPath}`);
    }
    
    const encryptedContent = await fs.readJSON(encryptedPath);
    const metadata: EncryptionMetadata = encryptedContent.metadata;
    const encryptedData = Buffer.from(encryptedContent.data, 'base64');
    
    if (!await this.canDecryptFile(metadata, session.user.id)) {
      throw new Error('Insufficient permissions to decrypt this file');
    }
    
    const salt = Buffer.from(metadata.keyDerivationInfo.salt, 'hex');
    const iv = Buffer.from(metadata.iv, 'hex');
    const authTag = Buffer.from(metadata.authTag, 'hex');
    
    const derivedKey = await this.deriveFileKey(
      metadata.encryptedBy,
      metadata.organizationId,
      metadata.classification,
      metadata.corporateLevel,
      salt
    );
    
    const decipher = crypto.createDecipher(this.ALGORITHM, derivedKey);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(JSON.stringify({
      userId: metadata.encryptedBy,
      organizationId: metadata.organizationId,
      classification: metadata.classification,
      corporateLevel: metadata.corporateLevel,
      fileName: path.basename(encryptedPath).replace('.encrypted', '')
    })));
    
    const decryptedData = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    const finalPath = outputPath || encryptedPath.replace('.encrypted', '');
    await fs.writeFile(finalPath, decryptedData);
    
    await this.logDecryptOperation(metadata, session.user.id, finalPath);
    
    return finalPath;
  }

  async encryptDirectory(
    dirPath: string,
    organizationId?: string,
    classification: ClassificationLevel = Classification.UNCLASSIFIED,
    corporateLevel: CorporateLevel = CorporateLevel.MEMBER
  ): Promise<string[]> {
    const encryptedFiles: string[] = [];
    
    const processDirectory = async (currentPath: string): Promise<void> => {
      const items = await fs.readdir(currentPath);
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          if (!item.startsWith('.') && item !== 'node_modules') {
            await processDirectory(itemPath);
          }
        } else if (stats.isFile() && !item.endsWith('.encrypted')) {
          try {
            const encryptedPath = await this.encryptFile(
              itemPath,
              organizationId,
              classification,
              corporateLevel
            );
            encryptedFiles.push(encryptedPath);
          } catch (error: any) {
            console.warn(`Warning: Could not encrypt ${itemPath}: ${error.message}`);
          }
        }
      }
    };
    
    await processDirectory(dirPath);
    return encryptedFiles;
  }

  async decryptDirectory(dirPath: string): Promise<string[]> {
    const decryptedFiles: string[] = [];
    
    const processDirectory = async (currentPath: string): Promise<void> => {
      const items = await fs.readdir(currentPath);
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          await processDirectory(itemPath);
        } else if (stats.isFile() && item.endsWith('.encrypted')) {
          try {
            const decryptedPath = await this.decryptFile(itemPath);
            decryptedFiles.push(decryptedPath);
          } catch (error: any) {
            console.warn(`Warning: Could not decrypt ${itemPath}: ${error.message}`);
          }
        }
      }
    };
    
    await processDirectory(dirPath);
    return decryptedFiles;
  }

  async startDecryptionSession(userId: string): Promise<void> {
    if (this.activeSessions.has(userId)) {
      const existingSession = this.activeSessions.get(userId)!;
      if (existingSession.expiresAt > new Date()) {
        return;
      }
    }
    
    const sessionKey = crypto.randomBytes(this.KEY_LENGTH);
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION);
    
    const session: DecryptionSession = {
      userId,
      sessionKey,
      derivedKeys: new Map(),
      expiresAt,
      organizationKeys: new Map()
    };
    
    this.activeSessions.set(userId, session);
    
    await fs.writeFile(this.sessionKeyPath, JSON.stringify({
      userId,
      sessionKey: sessionKey.toString('hex'),
      expiresAt: expiresAt.toISOString()
    }, null, 2));
  }

  async endDecryptionSession(userId: string): Promise<void> {
    this.activeSessions.delete(userId);
    
    if (await fs.pathExists(this.sessionKeyPath)) {
      await fs.remove(this.sessionKeyPath);
    }
  }

  async isFileEncrypted(filePath: string): Promise<boolean> {
    if (!await fs.pathExists(filePath)) {
      return false;
    }
    
    try {
      const content = await fs.readJSON(filePath);
      return content.metadata && content.metadata.algorithm && content.data;
    } catch {
      return false;
    }
  }

  async getFileMetadata(encryptedPath: string): Promise<EncryptionMetadata | null> {
    if (!await this.isFileEncrypted(encryptedPath)) {
      return null;
    }
    
    try {
      const content = await fs.readJSON(encryptedPath);
      return content.metadata;
    } catch {
      return null;
    }
  }

  private async generateMasterKey(): Promise<void> {
    const masterKey = crypto.randomBytes(this.KEY_LENGTH);
    await fs.writeFile(this.masterKeyPath, masterKey.toString('hex'));
    await fs.chmod(this.masterKeyPath, 0o600);
  }

  private async getMasterKey(): Promise<Buffer> {
    const masterKeyHex = await fs.readFile(this.masterKeyPath, 'utf8');
    return Buffer.from(masterKeyHex.trim(), 'hex');
  }

  private async deriveFileKey(
    userId: string,
    organizationId?: string,
    classification: ClassificationLevel = Classification.UNCLASSIFIED,
    corporateLevel: CorporateLevel = CorporateLevel.MEMBER,
    salt?: Buffer
  ): Promise<Buffer> {
    const masterKey = await this.getMasterKey();
    const keyId = `${userId}:${organizationId || 'global'}:${classification}:${corporateLevel}`;
    
    const session = this.activeSessions.get(userId);
    if (session?.derivedKeys.has(keyId)) {
      return session.derivedKeys.get(keyId)!;
    }
    
    const useSalt = salt || crypto.randomBytes(this.SALT_LENGTH);
    
    const derivedKey = crypto.pbkdf2Sync(
      Buffer.concat([
        masterKey,
        Buffer.from(userId),
        Buffer.from(organizationId || ''),
        Buffer.from(classification),
        Buffer.from(corporateLevel)
      ]),
      useSalt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      'sha256'
    );
    
    if (session) {
      session.derivedKeys.set(keyId, derivedKey);
    }
    
    return derivedKey;
  }

  private async canDecryptFile(metadata: EncryptionMetadata, userId: string): Promise<boolean> {
    const session = await this.authService.getCurrentSession();
    
    if (session.user.systemRole === SystemRole.SYSTEM_OWNER) {
      return true;
    }
    
    if (metadata.encryptedBy === userId) {
      return true;
    }
    
    if (metadata.organizationId) {
      const membership = session.organizationMemberships.find(
        m => m.organizationId === metadata.organizationId
      );
      
      if (!membership || membership.status !== 'ACTIVE') {
        return false;
      }
      
      // For now, allow access based on system role - can be enhanced later
      const canAccessClassification = (session.user.systemRole as SystemRole) === SystemRole.SYSTEM_OWNER || 
        metadata.classification === Classification.UNCLASSIFIED;
      
      if (!canAccessClassification) {
        return false;
      }
      
      const corporateHierarchy = [
        'OBSERVER', 'MEMBER', 'SENIOR_MEMBER', 'MANAGER', 'DIRECTOR',
        'VP', 'SVP', 'EVP', 'CFO', 'CTO', 'COO', 'CEO'
      ];
      
      const userLevel = corporateHierarchy.indexOf(membership.corporateLevel);
      const requiredLevel = corporateHierarchy.indexOf(metadata.corporateLevel);
      
      return userLevel >= requiredLevel;
    }
    
    return false;
  }

  private async logDecryptOperation(
    metadata: EncryptionMetadata,
    userId: string,
    filePath: string
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation: 'decrypt',
      userId,
      fileId: crypto.createHash('sha256').update(filePath).digest('hex'),
      organizationId: metadata.organizationId,
      classification: metadata.classification,
      corporateLevel: metadata.corporateLevel,
      originalOwner: metadata.encryptedBy
    };
    
    const logPath = '.pmcs/encryption/access.log';
    await fs.ensureFile(logPath);
    await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
  }
}