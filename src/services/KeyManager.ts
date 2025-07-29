import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import { AuthenticationService } from './AuthenticationService';
import { CorporateLevel, Classification, SystemRole, OrganizationMembership } from '../types';

type ClassificationLevel = Classification;

export interface KeyHierarchy {
  masterKey: Buffer;
  systemKeys: Map<SystemRole, Buffer>;
  organizationKeys: Map<string, Buffer>;
  classificationKeys: Map<string, Map<ClassificationLevel, Buffer>>;
  corporateKeys: Map<string, Map<CorporateLevel, Buffer>>;
  userSessionKeys: Map<string, Buffer>;
}

export interface KeyDerivationPath {
  level: 'master' | 'system' | 'organization' | 'classification' | 'corporate' | 'user';
  systemRole?: SystemRole;
  organizationId?: string;
  classification?: ClassificationLevel;
  corporateLevel?: CorporateLevel;
  userId?: string;
}

export interface KeyRotationSchedule {
  keyType: 'master' | 'organization' | 'user';
  lastRotated: Date;
  nextRotation: Date;
  rotationInterval: number; // in milliseconds
  autoRotate: boolean;
}

export class KeyManager {
  private readonly MASTER_KEY_LENGTH = 32;
  private readonly DERIVED_KEY_LENGTH = 32;
  private readonly PBKDF2_ITERATIONS = 100000;
  private readonly KEY_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
  
  private keyHierarchy: KeyHierarchy;
  private keyRotationSchedules: Map<string, KeyRotationSchedule> = new Map();
  private masterKeyPath = '.pmcs/encryption/master.key';
  private keyHierarchyPath = '.pmcs/encryption/key-hierarchy.json';
  private rotationSchedulePath = '.pmcs/encryption/rotation-schedule.json';

  constructor(private authService: AuthenticationService) {
    this.keyHierarchy = {
      masterKey: Buffer.alloc(0),
      systemKeys: new Map(),
      organizationKeys: new Map(),
      classificationKeys: new Map(),
      corporateKeys: new Map(),
      userSessionKeys: new Map()
    };
  }

  async initialize(): Promise<void> {
    await fs.ensureDir('.pmcs/encryption');
    
    if (!await fs.pathExists(this.masterKeyPath)) {
      await this.generateMasterKey();
    }
    
    await this.loadMasterKey();
    await this.loadKeyHierarchy();
    await this.loadRotationSchedules();
    await this.deriveSystemKeys();
  }

  async deriveOrganizationKey(organizationId: string): Promise<Buffer> {
    if (this.keyHierarchy.organizationKeys.has(organizationId)) {
      return this.keyHierarchy.organizationKeys.get(organizationId)!;
    }
    
    const derivationPath = `org:${organizationId}`;
    const orgKey = crypto.pbkdf2Sync(
      this.keyHierarchy.masterKey,
      Buffer.from(derivationPath),
      this.PBKDF2_ITERATIONS,
      this.DERIVED_KEY_LENGTH,
      'sha256'
    );
    
    this.keyHierarchy.organizationKeys.set(organizationId, orgKey);
    await this.saveKeyHierarchy();
    
    await this.scheduleKeyRotation(`org:${organizationId}`, 'organization');
    
    return orgKey;
  }

  async deriveClassificationKey(
    organizationId: string,
    classification: ClassificationLevel
  ): Promise<Buffer> {
    if (!this.keyHierarchy.classificationKeys.has(organizationId)) {
      this.keyHierarchy.classificationKeys.set(organizationId, new Map());
    }
    
    const orgClassificationKeys = this.keyHierarchy.classificationKeys.get(organizationId)!;
    
    if (orgClassificationKeys.has(classification)) {
      return orgClassificationKeys.get(classification)!;
    }
    
    const orgKey = await this.deriveOrganizationKey(organizationId);
    const derivationPath = `class:${classification}`;
    
    const classKey = crypto.pbkdf2Sync(
      orgKey,
      Buffer.from(derivationPath),
      this.PBKDF2_ITERATIONS,
      this.DERIVED_KEY_LENGTH,
      'sha256'
    );
    
    orgClassificationKeys.set(classification, classKey);
    await this.saveKeyHierarchy();
    
    return classKey;
  }

  async deriveCorporateKey(
    organizationId: string,
    classification: ClassificationLevel,
    corporateLevel: CorporateLevel
  ): Promise<Buffer> {
    if (!this.keyHierarchy.corporateKeys.has(organizationId)) {
      this.keyHierarchy.corporateKeys.set(organizationId, new Map());
    }
    
    const orgCorporateKeys = this.keyHierarchy.corporateKeys.get(organizationId)!;
    const corporateKeyId = `${classification}:${corporateLevel}`;
    
    if (orgCorporateKeys.has(corporateKeyId as CorporateLevel)) {
      return orgCorporateKeys.get(corporateKeyId as CorporateLevel)!;
    }
    
    const classKey = await this.deriveClassificationKey(organizationId, classification);
    const derivationPath = `corp:${corporateLevel}`;
    
    const corpKey = crypto.pbkdf2Sync(
      classKey,
      Buffer.from(derivationPath),
      this.PBKDF2_ITERATIONS,
      this.DERIVED_KEY_LENGTH,
      'sha256'
    );
    
    orgCorporateKeys.set(corporateKeyId as CorporateLevel, corpKey);
    await this.saveKeyHierarchy();
    
    return corpKey;
  }

  async deriveUserSessionKey(
    userId: string,
    organizationId?: string,
    classification: ClassificationLevel = Classification.UNCLASSIFIED,
    corporateLevel: CorporateLevel = CorporateLevel.MEMBER
  ): Promise<Buffer> {
    const sessionKeyId = `${userId}:${organizationId || 'global'}:${classification}:${corporateLevel}`;
    
    if (this.keyHierarchy.userSessionKeys.has(sessionKeyId)) {
      return this.keyHierarchy.userSessionKeys.get(sessionKeyId)!;
    }
    
    let parentKey: Buffer;
    
    if (organizationId) {
      parentKey = await this.deriveCorporateKey(organizationId, classification, corporateLevel);
    } else {
      const session = await this.authService.getCurrentSession();
      const systemKey = this.keyHierarchy.systemKeys.get(session.user.systemRole);
      if (!systemKey) {
        throw new Error(`System key not found for role: ${session.user.systemRole}`);
      }
      parentKey = systemKey;
    }
    
    const derivationPath = `user:${userId}:${Date.now()}`;
    const sessionKey = crypto.pbkdf2Sync(
      parentKey,
      Buffer.from(derivationPath),
      this.PBKDF2_ITERATIONS,
      this.DERIVED_KEY_LENGTH,
      'sha256'
    );
    
    this.keyHierarchy.userSessionKeys.set(sessionKeyId, sessionKey);
    await this.saveKeyHierarchy();
    
    await this.scheduleKeyRotation(`user:${userId}`, 'user');
    
    return sessionKey;
  }

  async validateUserKeyAccess(
    userId: string,
    organizationId?: string,
    classification: ClassificationLevel = Classification.UNCLASSIFIED,
    corporateLevel: CorporateLevel = CorporateLevel.MEMBER
  ): Promise<boolean> {
    try {
      const session = await this.authService.getCurrentSession();
      
      if (session.user.id !== userId && session.user.systemRole !== 'system.owner') {
        return false;
      }
      
      if (organizationId) {
        const membership = session.organizationMemberships.find(
          m => m.organizationId === organizationId && m.status === 'ACTIVE'
        );
        
        if (!membership) {
          return false;
        }
        
        // For now, allow access based on system role - can be enhanced later
        const canAccessClassification = (session.user.systemRole as SystemRole) === SystemRole.SYSTEM_OWNER || 
          classification === Classification.UNCLASSIFIED;
        
        if (!canAccessClassification) {
          return false;
        }
        
        const corporateHierarchy = [
          'OBSERVER', 'MEMBER', 'SENIOR_MEMBER', 'MANAGER', 'DIRECTOR',
          'VP', 'SVP', 'EVP', 'CFO', 'CTO', 'COO', 'CEO'
        ];
        
        const userLevel = corporateHierarchy.indexOf(membership.corporateLevel);
        const requiredLevel = corporateHierarchy.indexOf(corporateLevel);
        
        if (userLevel < requiredLevel) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }

  async rotateOrganizationKeys(organizationId: string): Promise<void> {
    this.keyHierarchy.organizationKeys.delete(organizationId);
    this.keyHierarchy.classificationKeys.delete(organizationId);
    this.keyHierarchy.corporateKeys.delete(organizationId);
    
    const userKeysToRotate = Array.from(this.keyHierarchy.userSessionKeys.keys())
      .filter(keyId => keyId.includes(`:${organizationId}:`));
    
    userKeysToRotate.forEach(keyId => {
      this.keyHierarchy.userSessionKeys.delete(keyId);
    });
    
    await this.deriveOrganizationKey(organizationId);
    await this.saveKeyHierarchy();
    
    await this.logKeyRotation('organization', organizationId);
  }

  async rotateUserSessionKeys(userId: string): Promise<void> {
    const userKeysToRotate = Array.from(this.keyHierarchy.userSessionKeys.keys())
      .filter(keyId => keyId.startsWith(`${userId}:`));
    
    userKeysToRotate.forEach(keyId => {
      this.keyHierarchy.userSessionKeys.delete(keyId);
    });
    
    await this.saveKeyHierarchy();
    await this.logKeyRotation('user', userId);
  }

  async rotateMasterKey(): Promise<void> {
    const oldMasterKey = this.keyHierarchy.masterKey;
    
    await this.generateMasterKey();
    await this.loadMasterKey();
    
    this.keyHierarchy.systemKeys.clear();
    this.keyHierarchy.organizationKeys.clear();
    this.keyHierarchy.classificationKeys.clear();
    this.keyHierarchy.corporateKeys.clear();
    this.keyHierarchy.userSessionKeys.clear();
    
    await this.deriveSystemKeys();
    await this.saveKeyHierarchy();
    
    await this.logKeyRotation('master', 'system');
  }

  async checkAndPerformScheduledRotations(): Promise<void> {
    const now = new Date();
    
    for (const [keyId, schedule] of this.keyRotationSchedules) {
      if (schedule.autoRotate && now >= schedule.nextRotation) {
        if (schedule.keyType === 'master') {
          await this.rotateMasterKey();
        } else if (schedule.keyType === 'organization') {
          const orgId = keyId.replace('org:', '');
          await this.rotateOrganizationKeys(orgId);
        } else if (schedule.keyType === 'user') {
          const userId = keyId.replace('user:', '');
          await this.rotateUserSessionKeys(userId);
        }
        
        schedule.lastRotated = now;
        schedule.nextRotation = new Date(now.getTime() + schedule.rotationInterval);
        
        await this.saveRotationSchedules();
      }
    }
  }

  async getKeyHierarchyInfo(): Promise<{
    totalKeys: number;
    organizationKeys: number;
    userSessionKeys: number;
    lastMasterRotation?: Date;
    nextScheduledRotations: Array<{ keyId: string; nextRotation: Date; keyType: string }>;
  }> {
    const totalKeys = this.keyHierarchy.systemKeys.size +
                     this.keyHierarchy.organizationKeys.size +
                     Array.from(this.keyHierarchy.classificationKeys.values())
                       .reduce((sum, map) => sum + map.size, 0) +
                     Array.from(this.keyHierarchy.corporateKeys.values())
                       .reduce((sum, map) => sum + map.size, 0) +
                     this.keyHierarchy.userSessionKeys.size;
    
    const nextRotations = Array.from(this.keyRotationSchedules.entries())
      .filter(([_, schedule]) => schedule.autoRotate)
      .map(([keyId, schedule]) => ({
        keyId,
        nextRotation: schedule.nextRotation,
        keyType: schedule.keyType
      }))
      .sort((a, b) => a.nextRotation.getTime() - b.nextRotation.getTime());
    
    return {
      totalKeys,
      organizationKeys: this.keyHierarchy.organizationKeys.size,
      userSessionKeys: this.keyHierarchy.userSessionKeys.size,
      lastMasterRotation: this.keyRotationSchedules.get('master:system')?.lastRotated,
      nextScheduledRotations: nextRotations
    };
  }

  private async generateMasterKey(): Promise<void> {
    const masterKey = crypto.randomBytes(this.MASTER_KEY_LENGTH);
    await fs.writeFile(this.masterKeyPath, masterKey.toString('hex'));
    await fs.chmod(this.masterKeyPath, 0o600);
  }

  private async loadMasterKey(): Promise<void> {
    const masterKeyHex = await fs.readFile(this.masterKeyPath, 'utf8');
    this.keyHierarchy.masterKey = Buffer.from(masterKeyHex.trim(), 'hex');
  }

  private async deriveSystemKeys(): Promise<void> {
    const systemRoles: SystemRole[] = [SystemRole.SYSTEM_OWNER, SystemRole.SYSTEM_ADMIN, SystemRole.SYSTEM_MEMBER];
    
    for (const role of systemRoles) {
      const derivationPath = `sys:${role}`;
      const systemKey = crypto.pbkdf2Sync(
        this.keyHierarchy.masterKey,
        Buffer.from(derivationPath),
        this.PBKDF2_ITERATIONS,
        this.DERIVED_KEY_LENGTH,
        'sha256'
      );
      
      this.keyHierarchy.systemKeys.set(role, systemKey);
    }
    
    await this.saveKeyHierarchy();
  }

  private async saveKeyHierarchy(): Promise<void> {
    const serializable = {
      systemKeys: Array.from(this.keyHierarchy.systemKeys.entries())
        .map(([role, key]) => [role, key.toString('hex')]),
      organizationKeys: Array.from(this.keyHierarchy.organizationKeys.entries())
        .map(([orgId, key]) => [orgId, key.toString('hex')]),
      classificationKeys: Array.from(this.keyHierarchy.classificationKeys.entries())
        .map(([orgId, classMap]) => [
          orgId,
          Array.from(classMap.entries()).map(([cls, key]) => [cls, key.toString('hex')])
        ]),
      corporateKeys: Array.from(this.keyHierarchy.corporateKeys.entries())
        .map(([orgId, corpMap]) => [
          orgId,
          Array.from(corpMap.entries()).map(([corp, key]) => [corp, key.toString('hex')])
        ]),
      userSessionKeys: Array.from(this.keyHierarchy.userSessionKeys.entries())
        .map(([sessionId, key]) => [sessionId, key.toString('hex')])
    };
    
    await fs.writeJSON(this.keyHierarchyPath, serializable, { spaces: 2 });
  }

  private async loadKeyHierarchy(): Promise<void> {
    if (!await fs.pathExists(this.keyHierarchyPath)) {
      return;
    }
    
    try {
      const data = await fs.readJSON(this.keyHierarchyPath);
      
      if (data.systemKeys) {
        data.systemKeys.forEach(([role, keyHex]: [SystemRole, string]) => {
          this.keyHierarchy.systemKeys.set(role, Buffer.from(keyHex, 'hex'));
        });
      }
      
      if (data.organizationKeys) {
        data.organizationKeys.forEach(([orgId, keyHex]: [string, string]) => {
          this.keyHierarchy.organizationKeys.set(orgId, Buffer.from(keyHex, 'hex'));
        });
      }
      
      if (data.classificationKeys) {
        data.classificationKeys.forEach(([orgId, classMappings]: [string, Array<[ClassificationLevel, string]>]) => {
          const classMap = new Map<ClassificationLevel, Buffer>();
          classMappings.forEach(([cls, keyHex]) => {
            classMap.set(cls, Buffer.from(keyHex, 'hex'));
          });
          this.keyHierarchy.classificationKeys.set(orgId, classMap);
        });
      }
      
      if (data.corporateKeys) {
        data.corporateKeys.forEach(([orgId, corpMappings]: [string, Array<[CorporateLevel, string]>]) => {
          const corpMap = new Map<CorporateLevel, Buffer>();
          corpMappings.forEach(([corp, keyHex]) => {
            corpMap.set(corp, Buffer.from(keyHex, 'hex'));
          });
          this.keyHierarchy.corporateKeys.set(orgId, corpMap);
        });
      }
      
      if (data.userSessionKeys) {
        data.userSessionKeys.forEach(([sessionId, keyHex]: [string, string]) => {
          this.keyHierarchy.userSessionKeys.set(sessionId, Buffer.from(keyHex, 'hex'));
        });
      }
    } catch (error: any) {
      console.warn('Warning: Could not load key hierarchy:', error.message);
    }
  }

  private async scheduleKeyRotation(
    keyId: string,
    keyType: 'master' | 'organization' | 'user'
  ): Promise<void> {
    const now = new Date();
    const schedule: KeyRotationSchedule = {
      keyType,
      lastRotated: now,
      nextRotation: new Date(now.getTime() + this.KEY_ROTATION_INTERVAL),
      rotationInterval: this.KEY_ROTATION_INTERVAL,
      autoRotate: true
    };
    
    this.keyRotationSchedules.set(keyId, schedule);
    await this.saveRotationSchedules();
  }

  private async saveRotationSchedules(): Promise<void> {
    const serializable = Array.from(this.keyRotationSchedules.entries())
      .map(([keyId, schedule]) => [
        keyId,
        {
          ...schedule,
          lastRotated: schedule.lastRotated.toISOString(),
          nextRotation: schedule.nextRotation.toISOString()
        }
      ]);
    
    await fs.writeJSON(this.rotationSchedulePath, serializable, { spaces: 2 });
  }

  private async loadRotationSchedules(): Promise<void> {
    if (!await fs.pathExists(this.rotationSchedulePath)) {
      return;
    }
    
    try {
      const data = await fs.readJSON(this.rotationSchedulePath);
      
      data.forEach(([keyId, scheduleData]: [string, any]) => {
        this.keyRotationSchedules.set(keyId, {
          ...scheduleData,
          lastRotated: new Date(scheduleData.lastRotated),
          nextRotation: new Date(scheduleData.nextRotation)
        });
      });
    } catch (error: any) {
      console.warn('Warning: Could not load rotation schedules:', error.message);
    }
  }

  private async logKeyRotation(keyType: string, keyId: string): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation: 'key_rotation',
      keyType,
      keyId,
      rotatedBy: (await this.authService.getCurrentSession()).user.id
    };
    
    const logPath = '.pmcs/encryption/key-rotation.log';
    await fs.ensureFile(logPath);
    await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
  }
}