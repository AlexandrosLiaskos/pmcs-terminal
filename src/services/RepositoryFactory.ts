import * as fs from 'fs-extra';
import { Repository } from '../types';
import { GitService } from './GitService';
import { FileBasedRepository } from './FileBasedRepository';
import { EncryptedFileRepository } from './EncryptedFileRepository';
import { AuthenticationService } from './AuthenticationService';
import { 
  Organization, 
  Portfolio, 
  Program, 
  Project, 
  Objective, 
  KeyResult, 
  Initiative, 
  Assignment, 
  Announcement 
} from '../types';

export class RepositoryFactory {
  private gitService: GitService;
  private authService?: AuthenticationService;
  private repositories: Map<string, Repository<any>> = new Map();

  constructor(gitService: GitService, authService?: AuthenticationService) {
    this.gitService = gitService;
    this.authService = authService;
  }

  setAuthenticationService(authService: AuthenticationService): void {
    this.authService = authService;
  }

  async initializeDirectoryStructure(): Promise<void> {
    const directories = [
      'organizations',
      'portfolios', 
      'programs',
      'projects',
      'objectives',
      'keyresults',
      'initiatives',
      'assignments',
      'announcements',
      'indexes',
      'workflows',
      'analytics',
      '.pmcs'
    ];

    for (const dir of directories) {
      await fs.ensureDir(dir);
    }

    // Create README files for each directory
    await this.createDirectoryReadmes();
  }

  private async createDirectoryReadmes(): Promise<void> {
    const readmeContent = {
      organizations: `# Organizations

This directory contains all organization entities in JSON format.
Each organization has its own subdirectory with the structure:
- organization.json (main entity data)
- portfolios/ (child portfolios)
- programs/ (child programs) 
- projects/ (child projects)
- assignments/ (assignments)
- announcements/ (announcements)
- rif/ (requests, issues, feedback)
`,
      portfolios: `# Portfolios

This directory contains portfolio entities organized by organization.
Structure: {organizationId}/portfolios/{portfolioId}/
`,
      programs: `# Programs

This directory contains program entities organized by organization.
Structure: {organizationId}/programs/{programId}/
`,
      projects: `# Projects

This directory contains project entities organized by organization.
Structure: {organizationId}/projects/{projectId}/
`,
      objectives: `# Objectives

This directory contains objective entities organized by parent entity.
Structure: {entityType}/{entityId}/objectives/{objectiveId}/
`,
      keyresults: `# Key Results

This directory contains key result entities organized by objective.
Structure: objectives/{objectiveId}/keyresults/{keyResultId}/
`,
      initiatives: `# Initiatives

This directory contains initiative entities organized by parent entity.
Structure: {entityType}/{entityId}/initiatives/{initiativeId}/
`,
      assignments: `# Assignments

This directory contains assignment entities organized by target entity.
Structure: {entityType}/{entityId}/assignments/{assignmentId}/
`,
      announcements: `# Announcements

This directory contains announcement entities organized by target entity.
Structure: {entityType}/{entityId}/announcements/{announcementId}/
`
    };

    for (const [dir, content] of Object.entries(readmeContent)) {
      await fs.writeFile(`${dir}/README.md`, content);
    }
  }

  getOrganizationRepository(): Repository<Organization> {
    const key = 'organization';
    
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Organization>(
          'organization',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getPortfolioRepository(): Repository<Portfolio> {
    const key = 'portfolio';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Portfolio>(
          'portfolio',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getProgramRepository(): Repository<Program> {
    const key = 'program';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Program>(
          'program',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getProjectRepository(): Repository<Project> {
    const key = 'project';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Project>(
          'project',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getObjectiveRepository(): Repository<Objective> {
    const key = 'objective';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Objective>(
          'objective',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getKeyResultRepository(): Repository<KeyResult> {
    const key = 'keyresult';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<KeyResult>(
          'keyresult',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getInitiativeRepository(): Repository<Initiative> {
    const key = 'initiative';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Initiative>(
          'initiative',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getAssignmentRepository(): Repository<Assignment> {
    const key = 'assignment';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Assignment>(
          'assignment',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  getAnnouncementRepository(): Repository<Announcement> {
    const key = 'announcement';
    if (!this.repositories.has(key)) {
      if (this.authService) {
        this.repositories.set(key, new EncryptedFileRepository<Announcement>(
          'announcement',
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        ));
      } else {
        throw new Error('Authentication service required for encrypted repositories');
      }
    }
    return this.repositories.get(key)!;
  }

  // Utility method to get any repository by type
  getRepository<T>(entityType: string): Repository<T> {
    switch (entityType) {
      case 'organization':
        return this.getOrganizationRepository() as Repository<T>;
      case 'portfolio':
        return this.getPortfolioRepository() as Repository<T>;
      case 'program':
        return this.getProgramRepository() as Repository<T>;
      case 'project':
        return this.getProjectRepository() as Repository<T>;
      case 'objective':
        return this.getObjectiveRepository() as Repository<T>;
      case 'keyresult':
        return this.getKeyResultRepository() as Repository<T>;
      case 'initiative':
        return this.getInitiativeRepository() as Repository<T>;
      case 'assignment':
        return this.getAssignmentRepository() as Repository<T>;
      case 'announcement':
        return this.getAnnouncementRepository() as Repository<T>;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  async migrateToEncryptedStorage(): Promise<{
    migrated: string[];
    errors: Array<{ repository: string; error: string }>;
  }> {
    if (!this.authService) {
      throw new Error('Authentication service required for encryption migration');
    }

    const migrated: string[] = [];
    const errors: Array<{ repository: string; error: string }> = [];
    
    const entityTypes = [
      'organization', 'portfolio', 'program', 'project',
      'objective', 'keyresult', 'initiative', 'assignment', 'announcement'
    ];

    for (const entityType of entityTypes) {
      try {
        const encryptedRepo = new EncryptedFileRepository<any>(
          entityType,
          this.gitService,
          this.authService,
          { autoEncrypt: true }
        );

        await encryptedRepo.initialize();
        const result = await encryptedRepo.migrateToEncryption();
        
        migrated.push(...result.migrated);
        errors.push(...result.errors.map(e => ({ repository: entityType, error: e.error })));
        
      } catch (error: any) {
        errors.push({
          repository: entityType,
          error: error.message
        });
      }
    }

    return { migrated, errors };
  }

  async getEncryptionStatus(): Promise<{
    totalRepositories: number;
    encryptedRepositories: number;
    encryptionPercentage: number;
    repositoryStatus: Array<{
      repository: string;
      totalFiles: number;
      encryptedFiles: number;
      encryptionPercentage: number;
    }>;
  }> {
    const entityTypes = [
      'organization', 'portfolio', 'program', 'project',
      'objective', 'keyresult', 'initiative', 'assignment', 'announcement'
    ];

    const repositoryStatus: Array<{
      repository: string;
      totalFiles: number;
      encryptedFiles: number;
      encryptionPercentage: number;
    }> = [];

    let totalEncryptedRepos = 0;

    for (const entityType of entityTypes) {
      try {
        if (!this.authService) continue;

        const encryptedRepo = new EncryptedFileRepository<any>(
          entityType,
          this.gitService,
          this.authService
        );

        await encryptedRepo.initialize();
        const status = await encryptedRepo.getEncryptionStatus();
        
        repositoryStatus.push({
          repository: entityType,
          totalFiles: status.totalFiles,
          encryptedFiles: status.encryptedFiles,
          encryptionPercentage: status.encryptionPercentage
        });

        if (status.encryptionPercentage === 100 && status.totalFiles > 0) {
          totalEncryptedRepos++;
        }
      } catch (error) {
        repositoryStatus.push({
          repository: entityType,
          totalFiles: 0,
          encryptedFiles: 0,
          encryptionPercentage: 0
        });
      }
    }

    return {
      totalRepositories: entityTypes.length,
      encryptedRepositories: totalEncryptedRepos,
      encryptionPercentage: (totalEncryptedRepos / entityTypes.length) * 100,
      repositoryStatus
    };
  }
}