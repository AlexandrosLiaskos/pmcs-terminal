# PMCS Terminal - API Reference

Technical reference for developers working with the PMCS Terminal Application codebase.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Services](#core-services)
- [Repository Pattern](#repository-pattern)
- [Command System](#command-system)
- [Type Definitions](#type-definitions)
- [Git Integration](#git-integration)
- [Authentication System](#authentication-system)
- [Error Handling](#error-handling)

## Architecture Overview

The PMCS Terminal Application follows a layered architecture:

```
┌─────────────────┐
│   CLI Layer     │  ← Commands (AuthCommands, OrganizationCommands, etc.)
├─────────────────┤
│  Service Layer  │  ← Business Logic (AuthService, GitService, etc.)
├─────────────────┤
│Repository Layer │  ← Data Access (FileBasedRepository)
├─────────────────┤
│ Storage Layer   │  ← File System + Git
└─────────────────┘
```

### Key Principles

- **Single Responsibility** - Each class has one clear purpose
- **Dependency Injection** - Services are injected via constructors
- **Repository Pattern** - Abstract data access layer
- **Command Pattern** - CLI commands are separate classes
- **Transaction Support** - Git-based atomic operations

## Core Services

### AuthenticationService

Handles user authentication and session management.

```typescript
class AuthenticationService {
  async authenticate(credentials: LoginCredentials): Promise<AuthSession>
  async getCurrentSession(): Promise<AuthSession>
  async logout(): Promise<void>
  async getSessionStatus(): Promise<SessionStatus>
  
  // Permission checks
  async canAccessEntity(entityType: string, entityId: string, userId: string): Promise<boolean>
  async canCreateOrganization(userId: string): Promise<boolean>
  async canCreateAssignment(entityType: string, entityId: string, userId: string): Promise<boolean>
  async canCreateAnnouncement(entityType: string, entityId: string, userId: string): Promise<boolean>
}
```

**Session Management**
- JWT tokens with configurable expiration
- File-based session storage in `.pmcs/session.json`
- Automatic session validation on each command
- Corporate context integration

**Default Users**
```typescript
// Located in .pmcs/users.json
{
  "users": [
    {
      "id": "admin-user",
      "email": "admin@pmcs.local",
      "name": "System Administrator",
      "password": "hashed_admin123",
      "corporateLevel": "CEO",
      "role": "Administrator",
      "permissions": ["CREATE_ORGANIZATION", "CREATE_ASSIGNMENT", "CREATE_ANNOUNCEMENT", "MANAGE_ANNOUNCEMENTS"]
    }
  ]
}
```

### GitService

Provides git integration with transaction support.

```typescript
class GitService {
  // Repository management
  async initialize(): Promise<void>
  async getStatus(): Promise<StatusResult>
  async getDiff(options?: DiffOptions): Promise<string>
  
  // Transaction support
  async startTransaction(): Promise<void>
  async commitTransaction(message: string, body?: string): Promise<string>
  async rollbackTransaction(): Promise<void>
  addToTransaction(filePath: string): void
  
  // Branch operations
  async createBranch(branchName: string, baseBranch?: string): Promise<void>
  async switchBranch(branchName: string): Promise<void>
  async mergeBranch(sourceBranch: string, targetBranch?: string): Promise<void>
  
  // Utilities
  async isWorkingDirectoryClean(): Promise<boolean>
  async getRepositoryStats(): Promise<RepositoryStats>
}
```

**Transaction Pattern**
```typescript
// Example usage in commands
await this.gitService.startTransaction();

try {
  // Perform file operations
  const entity = await this.repository.create(entityData);
  await this.createEntityFiles(entity);
  
  // Commit transaction
  await this.gitService.commitTransaction(
    "feat: Create new organization",
    "Organization: Strategic Initiatives\nClassification: SECRET"
  );
} catch (error) {
  await this.gitService.rollbackTransaction();
  throw error;
}
```

### RepositoryFactory

Creates and manages repository instances.

```typescript
class RepositoryFactory {
  createOrganizationRepo(): Repository<Organization>
  createAssignmentRepo(): Repository<Assignment>
  createAnnouncementRepo(): Repository<Announcement>
  
  // Generic repository creation
  createRepository<T extends BaseEntity>(entityType: string): Repository<T>
  
  async initializeDirectories(): Promise<void>
}
```

## Repository Pattern

### Repository Interface

```typescript
interface Repository<T> {
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>
  findById(id: string): Promise<T | null>
  findAll(): Promise<T[]>
  update(id: string, updates: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
  findAllUserVisible(userId: string): Promise<T[]>
  
  // Optional methods for specific repositories
  findByEntity?(entityType: string, entityId: string): Promise<T[]>
  findByAssignee?(assigneeEmail: string): Promise<T[]>
  findByAssigner?(assignerEmail: string): Promise<T[]>
}
```

### FileBasedRepository Implementation

```typescript
class FileBasedRepository<T extends BaseEntity> implements Repository<T> {
  constructor(
    private entityType: string,
    private gitService: GitService,
    private authService: AuthenticationService
  ) {}

  async create(entityData: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const id = createId();
    const now = new Date();
    
    const entity: T = {
      ...entityData,
      id,
      createdAt: now,
      updatedAt: now
    } as T;

    // Write to file
    const filePath = this.getEntityPath(id);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJSON(filePath, entity, { spaces: 2 });
    
    // Add to git transaction if active
    this.gitService.addToTransaction(filePath);
    
    return entity;
  }
  
  private getEntityPath(id: string): string {
    return path.join(this.entityType + 's', id + '.json');
  }
}
```

**File Structure**
```
organizations/
├── org-123.json
└── org-456.json

assignments/
├── assignment-789.json
└── assignment-012.json

announcements/
├── announcement-345.json
└── announcement-678.json
```

## Command System

### Command Base Pattern

All commands follow a consistent pattern:

```typescript
class EntityCommands {
  constructor(
    private authService: AuthenticationService,
    private repository: Repository<Entity>,
    private gitService: GitService
  ) {}

  async create(options: CreateOptions): Promise<void> {
    // 1. Validate permissions
    const session = await this.authService.getCurrentSession();
    if (!session.permissions.canCreateEntity) {
      throw new Error('Insufficient permissions');
    }

    // 2. Start git transaction
    await this.gitService.startTransaction();

    try {
      // 3. Create entity
      const entity = await this.repository.create(entityData);
      
      // 4. Create supporting files
      await this.createEntityStructure(entity);
      
      // 5. Commit transaction
      await this.gitService.commitTransaction(
        `feat: Create ${entityType} ${entity.name}`,
        this.generateCommitBody(entity, session)
      );
      
      // 6. Success feedback
      console.log(chalk.green(`✅ ${entityType} created successfully`));
      
    } catch (error: any) {
      await this.gitService.rollbackTransaction();
      throw error;
    }
  }

  async list(options: ListOptions): Promise<void> {
    // 1. Get entities based on permissions
    const session = await this.authService.getCurrentSession();
    const entities = await this.repository.findAllUserVisible(session.user.id);
    
    // 2. Apply filters
    const filteredEntities = this.applyFilters(entities, options);
    
    // 3. Display results
    if (options.format === 'json') {
      console.log(JSON.stringify(filteredEntities, null, 2));
    } else {
      this.displayTable(filteredEntities);
    }
  }

  async show(id: string, options: ShowOptions): Promise<void> {
    // 1. Find entity
    const entity = await this.repository.findById(id);
    if (!entity) {
      throw new Error(`${entityType} not found`);
    }

    // 2. Check permissions
    const session = await this.authService.getCurrentSession();
    if (!await this.authService.canAccessEntity(entityType, id, session.user.id)) {
      throw new Error('Access denied');
    }

    // 3. Display entity
    if (options.format === 'json') {
      console.log(JSON.stringify(entity, null, 2));
    } else {
      this.displayEntityDetails(entity);
    }
  }
}
```

### Command Registration

Commands are registered in `src/cli.ts`:

```typescript
class PMCSApplication {
  private setupCommands(): void {
    // Authentication commands
    const authGroup = this.program
      .command('auth')
      .description('Authentication and session management');
    
    authGroup
      .command('login')
      .description('Login to PMCS system')
      .option('-e, --email <email>', 'User email')
      .option('-p, --password <password>', 'User password')
      .action(async (options) => {
        await this.authCommands.login(options);
      });

    // Organization commands
    const orgGroup = this.program
      .command('organization')
      .description('Manage organizations');
    
    orgGroup
      .command('create')
      .description('Create a new organization')
      .requiredOption('-n, --name <name>', 'Organization name')
      .option('-d, --description <description>', 'Organization description')
      .action(async (options) => {
        await this.organizationCommands.create(options);
      });
  }
}
```

## Type Definitions

### Core Entity Types

```typescript
interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: string;
}

interface Organization extends BaseEntity {
  name: string;
  description?: string;
  corporateLevel: CorporateLevel;
  settings: OrganizationSettings;
}

interface Assignment extends BaseEntity {
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

interface Announcement extends BaseEntity {
  title: string;
  content: string;
  type: AnnouncementType;
  priority: Priority;
  entityType: EntityType;
  entityId: string;
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
```

### Enums

```typescript
enum CorporateLevel {
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

enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

enum AssignmentStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE'
}

enum Classification {
  TOP_SECRET = 'TOP_SECRET',
  SECRET = 'SECRET',
  CONFIDENTIAL = 'CONFIDENTIAL',
  UNCLASSIFIED = 'UNCLASSIFIED'
}
```

## Git Integration

### Transaction System

The git integration provides ACID-like properties for file operations:

```typescript
// Transaction lifecycle
class GitTransaction {
  private transactionActive: boolean = false;
  private transactionFiles: string[] = [];

  async startTransaction(): Promise<void> {
    if (this.transactionActive) {
      throw new Error('Transaction already active');
    }
    
    this.transactionActive = true;
    this.transactionFiles = [];
  }

  addToTransaction(filePath: string): void {
    if (!this.transactionActive) {
      throw new Error('No active transaction');
    }
    
    this.transactionFiles.push(filePath);
  }

  async commitTransaction(message: string, body?: string): Promise<string> {
    if (!this.transactionActive) {
      throw new Error('No transaction active');
    }

    try {
      // Add files to git
      await this.git.add(this.transactionFiles);
      
      // Create commit
      const commitMessage = body ? `${message}\n\n${body}` : message;
      const result = await this.git.commit(commitMessage);
      
      // Clear transaction state
      this.transactionActive = false;
      this.transactionFiles = [];
      
      return result.commit;
    } catch (error: any) {
      await this.rollbackTransaction();
      throw new Error(`Commit failed: ${error.message}`);
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.transactionActive) {
      return;
    }

    try {
      // Reset any staged files
      if (this.transactionFiles.length > 0) {
        await this.git.reset(['HEAD', ...this.transactionFiles]);
      }
    } catch (error: any) {
      console.warn('Warning: Could not fully rollback transaction:', error.message);
    } finally {
      this.transactionActive = false;
      this.transactionFiles = [];
    }
  }
}
```

### Commit Message Format

All commits follow a consistent format:

```
<type>: <subject>

<body>

🔒 Classification: <level>
👤 Author: <name> [<corporate-level>]
🏢 Entity: <entity-type>/<entity-id>
⏰ Timestamp: <iso-date>

🤖 Generated with PMCS Terminal Application
```

Example:
```
feat: Create organization Strategic Initiatives

Organization: Strategic Initiatives
Corporate Level: ORGANIZATION
Classification: UNCLASSIFIED

Created-By: admin@pmcs.local
[Administrator]

🔒 Classification: UNCLASSIFIED
👤 Author: System Administrator [CEO]
🏢 Entity: organization/khj6zyfhb4lrdioqyhy6lnst
⏰ Timestamp: 2024-07-29T14:30:45.123Z

🤖 Generated with PMCS Terminal Application
```

## Authentication System

### JWT Token Structure

```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  corporateLevel: CorporateLevel;
  permissions: string[];
  iat: number;  // Issued at
  exp: number;  // Expiration
}
```

### Session Management

```typescript
interface AuthSession {
  user: User;
  permissions: SessionPermissions;
  corporateContext: CorporateContext;
  token: string;
  expiresAt: Date;
}

interface SessionPermissions {
  canCreateOrganization: boolean;
  canCreateAssignment: boolean;
  canCreateAnnouncement: boolean;
  canManageAnnouncements: boolean;
}
```

### Permission Hierarchy

Permission checks follow corporate hierarchy rules:

```typescript
class PermissionChecker {
  canAccessEntity(userLevel: CorporateLevel, entityLevel: CorporateLevel): boolean {
    const hierarchy = [
      'CEO', 'COO', 'CTO', 'CFO', 'EVP', 'SVP', 'VP', 
      'DIRECTOR', 'MANAGER', 'SENIOR_MEMBER', 'MEMBER', 'OBSERVER'
    ];
    
    const userIndex = hierarchy.indexOf(userLevel);
    const entityIndex = hierarchy.indexOf(entityLevel);
    
    // Higher levels (lower index) can access lower levels (higher index)
    return userIndex <= entityIndex;
  }

  canAccessClassification(userLevel: CorporateLevel, classification: Classification): boolean {
    const classificationRules: Record<Classification, CorporateLevel[]> = {
      TOP_SECRET: ['CEO', 'COO', 'CTO', 'CFO'],
      SECRET: ['CEO', 'COO', 'CTO', 'CFO', 'EVP', 'SVP', 'VP'],
      CONFIDENTIAL: ['CEO', 'COO', 'CTO', 'CFO', 'EVP', 'SVP', 'VP', 'DIRECTOR'],
      UNCLASSIFIED: Object.values(CorporateLevel)
    };
    
    return classificationRules[classification].includes(userLevel);
  }
}
```

## Error Handling

### Error Types

```typescript
class PMCSError extends Error {
  constructor(
    public code: string,
    message: string,
    public context?: any
  ) {
    super(message);
    this.name = 'PMCSError';
  }
}

class AuthenticationError extends PMCSError {
  constructor(message: string) {
    super('AUTH_ERROR', message);
  }
}

class PermissionError extends PMCSError {
  constructor(action: string, resource: string) {
    super('PERMISSION_ERROR', `Insufficient permissions to ${action} ${resource}`);
  }
}

class ValidationError extends PMCSError {
  constructor(field: string, value: any) {
    super('VALIDATION_ERROR', `Invalid value for ${field}: ${value}`);
  }
}
```

### Error Handling Pattern

```typescript
// In command classes
async create(options: CreateOptions): Promise<void> {
  try {
    // Command implementation
  } catch (error: any) {
    // Log error for debugging
    if (options.verbose) {
      console.error('Debug info:', error.stack);
    }
    
    // User-friendly error message
    if (error instanceof PMCSError) {
      console.error(chalk.red(`❌ ${error.message}`));
    } else {
      console.error(chalk.red(`❌ Unexpected error: ${error.message}`));
    }
    
    // Exit with error code
    process.exit(1);
  }
}
```

### Validation

Input validation using Zod schemas:

```typescript
import { z } from 'zod';

const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  corporateLevel: z.nativeEnum(CorporateLevel).optional(),
  classification: z.nativeEnum(Classification).optional(),
  requiresApproval: z.boolean().optional()
});

// Usage in commands
async create(options: CreateOrganizationOptions): Promise<void> {
  // Validate input
  const validatedOptions = CreateOrganizationSchema.parse(options);
  
  // Continue with validated data
  // ...
}
```

## Development Guidelines

### Adding New Entity Types

1. **Define Types**
   ```typescript
   // In src/types/index.ts
   interface NewEntity extends BaseEntity {
     name: string;
     // ... other properties
   }
   ```

2. **Create Repository**
   ```typescript
   // In RepositoryFactory
   createNewEntityRepo(): Repository<NewEntity> {
     return new FileBasedRepository<NewEntity>('newentity', this.gitService, this.authService);
   }
   ```

3. **Create Commands**
   ```typescript
   // In src/commands/NewEntityCommands.ts
   export class NewEntityCommands {
     constructor(
       private authService: AuthenticationService,
       private repository: Repository<NewEntity>,
       private gitService: GitService
     ) {}
     
     // Implement create, list, show methods
   }
   ```

4. **Register Commands**
   ```typescript
   // In src/cli.ts
   private setupNewEntityCommands(): void {
     const newEntityGroup = this.program
       .command('newentity')
       .description('Manage new entities');
     
     // Add subcommands
   }
   ```

5. **Add Help Documentation**
   ```typescript
   // In src/utils/HelpSystem.ts
   this.commands.set('newentity', {
     name: 'New Entity Management',
     description: 'Create and manage new entities',
     // ... help content
   });
   ```

### Testing Approach

```typescript
// Example test structure
describe('OrganizationCommands', () => {
  let authService: AuthenticationService;
  let repository: Repository<Organization>;
  let gitService: GitService;
  let commands: OrganizationCommands;

  beforeEach(() => {
    // Setup mocks
    authService = new MockAuthenticationService();
    repository = new MockRepository<Organization>();
    gitService = new MockGitService();
    commands = new OrganizationCommands(authService, repository, gitService);
  });

  it('should create organization with valid input', async () => {
    // Arrange
    const options = { name: 'Test Org', description: 'Test' };
    
    // Act
    await commands.create(options);
    
    // Assert
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Org' })
    );
  });
});
```

---

*This API reference provides the technical foundation for understanding and extending the PMCS Terminal Application codebase.*