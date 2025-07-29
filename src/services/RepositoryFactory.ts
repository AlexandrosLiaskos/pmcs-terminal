import * as fs from 'fs-extra';
import { Repository } from '../types';
import { GitService } from './GitService';
import { FileBasedRepository } from './FileBasedRepository';
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
  private repositories: Map<string, Repository<any>> = new Map();

  constructor(gitService: GitService) {
    this.gitService = gitService;
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
      this.repositories.set(key, new FileBasedRepository<Organization>(
        'organizations',
        this.gitService,
        'organization'
      ));
    }
    return this.repositories.get(key)!;
  }

  getPortfolioRepository(): Repository<Portfolio> {
    const key = 'portfolio';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<Portfolio>(
        'portfolios',
        this.gitService,
        'portfolio'
      ));
    }
    return this.repositories.get(key)!;
  }

  getProgramRepository(): Repository<Program> {
    const key = 'program';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<Program>(
        'programs',
        this.gitService,
        'program'
      ));
    }
    return this.repositories.get(key)!;
  }

  getProjectRepository(): Repository<Project> {
    const key = 'project';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<Project>(
        'projects',
        this.gitService,
        'project'
      ));
    }
    return this.repositories.get(key)!;
  }

  getObjectiveRepository(): Repository<Objective> {
    const key = 'objective';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<Objective>(
        'objectives',
        this.gitService,
        'objective'
      ));
    }
    return this.repositories.get(key)!;
  }

  getKeyResultRepository(): Repository<KeyResult> {
    const key = 'keyresult';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<KeyResult>(
        'keyresults',
        this.gitService,
        'keyresult'
      ));
    }
    return this.repositories.get(key)!;
  }

  getInitiativeRepository(): Repository<Initiative> {
    const key = 'initiative';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<Initiative>(
        'initiatives',
        this.gitService,
        'initiative'
      ));
    }
    return this.repositories.get(key)!;
  }

  getAssignmentRepository(): Repository<Assignment> {
    const key = 'assignment';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<Assignment>(
        'assignments',
        this.gitService,
        'assignment'
      ));
    }
    return this.repositories.get(key)!;
  }

  getAnnouncementRepository(): Repository<Announcement> {
    const key = 'announcement';
    if (!this.repositories.has(key)) {
      this.repositories.set(key, new FileBasedRepository<Announcement>(
        'announcements',
        this.gitService,
        'announcement'
      ));
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
}