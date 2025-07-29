// Core Entity Types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: string;
}

export interface Organization extends BaseEntity {
  name: string;
  description?: string;
  corporateLevel: CorporateLevel;
  settings: OrganizationSettings;
}

export interface Portfolio extends BaseEntity {
  name: string;
  description?: string;
  organizationId: string;
  status: EntityStatus;
}

export interface Program extends BaseEntity {
  name: string;
  description?: string;
  organizationId: string;
  portfolioId?: string;
  status: EntityStatus;
}

export interface Project extends BaseEntity {
  name: string;
  description?: string;
  organizationId: string;
  portfolioId?: string;
  programId?: string;
  status: EntityStatus;
}

export interface Objective extends BaseEntity {
  title: string;
  description?: string;
  organizationId: string;
  portfolioId?: string;
  programId?: string;
  projectId?: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  dueDate?: Date;
  status: EntityStatus;
}

export interface KeyResult extends BaseEntity {
  title: string;
  description?: string;
  objectiveId: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  status: EntityStatus;
}

export interface Initiative extends BaseEntity {
  title: string;
  description?: string;
  organizationId: string;
  portfolioId?: string;
  programId?: string;
  projectId?: string;
  objectiveId?: string;
  keyResultId?: string;
  status: EntityStatus;
  priority: Priority;
}

export interface Assignment extends BaseEntity {
  title: string;
  description?: string;
  entityType: EntityType;
  entityId: string;
  assignerEmail: string;
  assigneeEmail: string;
  priority: Priority;
  status: AssignmentStatus;
  dueDate?: Date;
  corporateContext: AssignmentCorporateContext;
}

export interface Announcement extends BaseEntity {
  title: string;
  subtitle?: string;
  content: string;
  entityType: EntityType;
  entityId: string;
  type: AnnouncementType;
  priority: Priority;
  targetAudience?: string;
  authorEmail?: string;
  status?: AnnouncementStatus;
  publishAt?: Date;
  publishedAt?: Date;
  readBy?: string[];
  corporateContext: {
    authorRole: string;
    authorLevel: CorporateLevel;
    classification: Classification;
    approvalRequired: boolean;
    approvedBy: string[];
  };
}

// Enums
export enum CorporateLevel {
  CEO = 'CEO',
  COO = 'COO',
  CTO = 'CTO',
  CFO = 'CFO',
  EVP = 'EVP',
  SVP = 'SVP',
  VP = 'VP',
  DIRECTOR = 'DIRECTOR',
  MANAGER = 'MANAGER',
  SENIOR_MEMBER = 'SENIOR_MEMBER',
  MEMBER = 'MEMBER',
  OBSERVER = 'OBSERVER'
}

export enum EntityStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ARCHIVED = 'ARCHIVED'
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum AssignmentStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE'
}

export enum AnnouncementStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED'
}

export enum AnnouncementType {
  GENERAL = 'GENERAL',
  URGENT = 'URGENT',
  POLICY = 'POLICY',
  SYSTEM = 'SYSTEM'
}

export enum EntityType {
  ORGANIZATION = 'organization',
  PORTFOLIO = 'portfolio',
  PROGRAM = 'program',
  PROJECT = 'project',
  OBJECTIVE = 'objective',
  KEY_RESULT = 'keyresult',
  INITIATIVE = 'initiative'
}

export enum Classification {
  TOP_SECRET = 'TOP_SECRET',
  SECRET = 'SECRET',
  CONFIDENTIAL = 'CONFIDENTIAL',
  UNCLASSIFIED = 'UNCLASSIFIED'
}

// Support Interfaces
export interface OrganizationSettings {
  classification: Classification;
  requiresApproval: boolean;
  defaultAccessLevel: CorporateLevel;
}

export interface AssignmentCorporateContext {
  assignerRole: string;
  assignerLevel: CorporateLevel;
  requiresApproval: boolean;
  approvalChain: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  corporateLevel: CorporateLevel;
  role: string;
  permissions: string[];
}

export interface SessionPermissions {
  canCreateOrganization: boolean;
  canCreateAssignment: boolean;
  canCreateAnnouncement: boolean;
  canManageAnnouncements: boolean;
}

export interface AuthSession {
  user: User;
  permissions: SessionPermissions;
  corporateContext: CorporateContext;
  token: string;
  expiresAt: Date;
}

export interface CorporateContext {
  role: string;
  level: CorporateLevel;
  approvals: string[];
  classification: Classification;
}

// Command Interfaces
export interface CommandOptions {
  format?: 'table' | 'json' | 'yaml';
  verbose?: boolean;
}

export interface CreateOrganizationOptions extends CommandOptions {
  name: string;
  description?: string;
  corporateLevel?: CorporateLevel;
  classification?: Classification;
  requiresApproval?: boolean;
}

export interface CreateAssignmentOptions extends CommandOptions {
  title: string;
  description?: string;
  entityType: EntityType;
  entityId: string;
  assigneeEmail: string;
  priority?: Priority;
  dueDate?: Date;
}

export interface CreateAnnouncementOptions extends CommandOptions {
  title: string;
  subtitle?: string;
  content: string;
  entityType: EntityType;
  entityId: string;
  type?: AnnouncementType;
  priority?: Priority;
  targetAudience?: string;
  publishNow?: boolean;
  scheduledDate?: Date;
}

export interface ListOptions extends CommandOptions {
  status?: EntityStatus;
  assignedToMe?: boolean;
  assignedByMe?: boolean;
  unreadOnly?: boolean;
}

export interface ShowOptions extends CommandOptions {
  detailed?: boolean;
}

// Repository Interfaces
export interface Repository<T> {
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  findAllUserVisible(userId: string): Promise<T[]>;
  findByEntity?(entityType: string, entityId: string): Promise<T[]>;
  findByAssignee?(assigneeEmail: string): Promise<T[]>;
  findByAssigner?(assignerEmail: string): Promise<T[]>;
}

// Service Interfaces
export interface GitService {
  startTransaction(): Promise<void>;
  commitTransaction(message: string, body?: string): Promise<string>;
  rollbackTransaction(): Promise<void>;
  getStatus(): Promise<any>;
  getDiff(options?: any): Promise<any>;
}

export interface AuthenticationService {
  authenticate(credentials: any): Promise<AuthSession>;
  getCurrentSession(): Promise<AuthSession>;
  validateSession(token: string): Promise<boolean>;
  canAccessEntity(entityType: string, entityId: string, userId: string): Promise<boolean>;
  canCreateOrganization(userId: string): Promise<boolean>;
  canCreateAssignment(entityType: string, entityId: string, userId: string): Promise<boolean>;
  canCreateAnnouncement(entityType: string, entityId: string, userId: string): Promise<boolean>;
}