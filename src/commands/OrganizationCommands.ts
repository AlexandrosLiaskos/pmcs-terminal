import chalk from 'chalk';
import Table from 'cli-table3';
import { AuthenticationService } from '../services/AuthenticationService';
import { Repository, Organization, CreateOrganizationOptions, ListOptions, ShowOptions } from '../types';
import { GitService } from '../services/GitService';

export class OrganizationCommands {
  constructor(
    private authService: AuthenticationService,
    private orgRepo: Repository<Organization>,
    private gitService: GitService
  ) {}

  async create(options: CreateOrganizationOptions): Promise<void> {
    try {
      // Validate user permissions
      const session = await this.authService.getCurrentSession();
      if (!session.permissions.canCreateOrganization) {
        throw new Error('Insufficient permissions to create organization');
      }

      // Begin git transaction
      await this.gitService.startTransaction();

      try {
        // Create organization with corporate hierarchy integration
        const org = await this.orgRepo.create({
          name: options.name,
          description: options.description,
          corporateLevel: options.corporateLevel || 'ORGANIZATION' as any,
          settings: {
            classification: options.classification || 'UNCLASSIFIED' as any,
            requiresApproval: options.requiresApproval || false,
            defaultAccessLevel: 'OBSERVER' as any
          },
          createdBy: session.user.id,
          version: '1.0.0'
        });

        // Create organization directory structure
        await this.createOrganizationStructure(org);

        // Commit changes
        await this.gitService.commitTransaction(
          `feat: Create organization ${org.name}`,
          `Organization: ${org.name}
Corporate Level: ${org.corporateLevel}
Classification: ${org.settings.classification}

Created-By: ${session.user.email}
[${session.corporateContext.role}]

Approved-By: ${session.corporateContext.approvals.join(', ')}`
        );

        console.log(chalk.green(`✅ Organization '${org.name}' created successfully`));
        console.log(chalk.gray(`📁 Path: organizations/${org.id}`));
        console.log(chalk.gray(`🔑 ID: ${org.id}`));

      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to create organization:'), error.message);
      process.exit(1);
    }
  }

  async list(options: ListOptions = {}): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      const organizations = await this.orgRepo.findAllUserVisible(session.user.id);

      if (organizations.length === 0) {
        console.log(chalk.yellow('📋 No organizations found'));
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(organizations, null, 2));
        return;
      }

      console.log(chalk.cyan(`\n📋 Organizations (${organizations.length}):\n`));

      // Create table display
      const table = new Table({
        head: [
          chalk.bold('ID'),
          chalk.bold('Name'),
          chalk.bold('Corporate Level'),
          chalk.bold('Classification'),
          chalk.bold('Created')
        ],
        colWidths: [12, 30, 15, 15, 12]
      });

      for (const org of organizations) {
        table.push([
          org.id.substring(0, 8) + '...',
          org.name,
          org.corporateLevel,
          org.settings.classification,
          org.createdAt.toLocaleDateString()
        ]);
      }

      console.log(table.toString());

      // Show quick actions
      console.log(chalk.gray('\n💡 Quick Actions:'));
      console.log(chalk.gray('  pmcs organization show <id>  - View organization details'));
      console.log(chalk.gray('  pmcs organization edit <id>  - Edit organization'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list organizations:'), error.message);
      process.exit(1);
    }
  }

  async show(id: string, options: ShowOptions = {}): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      const org = await this.orgRepo.findById(id);

      if (!org) {
        throw new Error(`Organization with ID '${id}' not found`);
      }

      // Check access permissions
      if (!await this.authService.canAccessEntity('organization', id, session.user.id)) {
        throw new Error('Access denied to this organization');
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(org, null, 2));
        return;
      }

      // Display organization details
      console.log(chalk.cyan(`\n🏢 Organization: ${org.name}`));
      console.log(`📝 Description: ${org.description || 'No description'}`);
      console.log(`🔑 ID: ${org.id}`);
      console.log(`📊 Corporate Level: ${org.corporateLevel}`);
      console.log(`🔒 Classification: ${org.settings.classification}`);
      console.log(`📅 Created: ${org.createdAt.toLocaleDateString()}`);
      console.log(`👤 Created By: ${org.createdBy}`);

      // Show quick actions
      console.log(chalk.gray('\n💡 Actions:'));
      console.log(chalk.gray(`  pmcs organization edit ${id}     - Edit this organization`));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to show organization:'), error.message);
      process.exit(1);
    }
  }

  private async createOrganizationStructure(org: Organization): Promise<void> {
    const fs = await import('fs-extra');
    const orgPath = `organizations/${org.id}`;

    // Create organization directory and metadata
    await fs.ensureDir(orgPath);

    // Create organization metadata file
    await fs.writeJSON(`${orgPath}/organization.json`, {
      ...org,
      entityType: 'organization',
      version: '1.0.0',
      lastModified: new Date().toISOString()
    }, { spaces: 2 });

    // Create subdirectories for child entities
    await fs.ensureDir(`${orgPath}/portfolios`);
    await fs.ensureDir(`${orgPath}/programs`);
    await fs.ensureDir(`${orgPath}/projects`);
    await fs.ensureDir(`${orgPath}/assignments`);
    await fs.ensureDir(`${orgPath}/announcements`);
    await fs.ensureDir(`${orgPath}/rif`);
    await fs.ensureDir(`${orgPath}/analytics`);

    // Create README with organization context
    await fs.writeFile(`${orgPath}/README.md`, this.generateOrganizationReadme(org));

    // Add files to git transaction
    this.gitService.addToTransaction(`${orgPath}/organization.json`);
    this.gitService.addToTransaction(`${orgPath}/README.md`);
  }

  private generateOrganizationReadme(org: Organization): string {
    return `# ${org.name}

## Organization Overview

**Corporate Level:** ${org.corporateLevel}  
**Classification:** ${org.settings.classification}  
**Created:** ${org.createdAt.toLocaleDateString()}  

${org.description || 'No description provided.'}

## Structure

This organization contains the following entity types:
- **Portfolios** (/portfolios/) - Strategic groupings of programs
- **Programs** (/programs/) - Operational groupings of projects  
- **Projects** (/projects/) - Individual project entities
- **Assignments** (/assignments/) - Task assignments within organization
- **Announcements** (/announcements/) - Organization communications
- **RIF** (/rif/) - Requests, Issues, and Feedback

## Quick Commands

\`\`\`bash
# View organization details
pmcs organization show ${org.id}

# Manage organization members
pmcs organization members ${org.id}
\`\`\`

---
*Generated by PMCS Terminal Application*
`;
  }
}