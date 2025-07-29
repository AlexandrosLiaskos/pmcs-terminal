import chalk from 'chalk';
import inquirer from 'inquirer';
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
      if (!session.systemPermissions.canCreateOrganizations) {
        throw new Error('Insufficient permissions to create organization. Only system owners and admins can create organizations.');
      }

      let { name, description, classification, corporateLevel, requiresApproval } = options;

      // If required fields not provided via options, prompt for them
      if (!name) {
        console.log(chalk.cyan('🏢 Create New Organization\n'));
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Organization Name:',
            when: !name,
            validate: (input: string) => {
              if (!input.trim()) {
                return 'Organization name is required';
              }
              if (input.length < 2) {
                return 'Organization name must be at least 2 characters';
              }
              return true;
            }
          },
          {
            type: 'input',
            name: 'description',
            message: 'Description (optional):',
            when: !description
          },
          {
            type: 'list',
            name: 'classification',
            message: 'Security Classification:',
            when: !classification,
            choices: [
              { name: 'UNCLASSIFIED - Standard access level', value: 'UNCLASSIFIED' },
              { name: 'CONFIDENTIAL - Moderate security level', value: 'CONFIDENTIAL' },
              { name: 'SECRET - High security level', value: 'SECRET' },
              { name: 'TOP_SECRET - Highest security level', value: 'TOP_SECRET' }
            ],
            default: 'UNCLASSIFIED'
          },
          {
            type: 'list',
            name: 'corporateLevel',
            message: 'Corporate Level:',
            when: !corporateLevel,
            choices: [
              { name: 'ORGANIZATION - Standard organization level', value: 'ORGANIZATION' },
              { name: 'DIVISION - Division level', value: 'DIVISION' },
              { name: 'SUBSIDIARY - Subsidiary level', value: 'SUBSIDIARY' },
              { name: 'ENTERPRISE - Enterprise level', value: 'ENTERPRISE' }
            ],
            default: 'ORGANIZATION'
          },
          {
            type: 'confirm',
            name: 'requiresApproval',
            message: 'Require approval for changes?',
            when: requiresApproval === undefined,
            default: false
          }
        ]);

        name = name || answers.name;
        description = description || answers.description;
        classification = classification || answers.classification;
        corporateLevel = corporateLevel || answers.corporateLevel;
        requiresApproval = requiresApproval ?? answers.requiresApproval;
      }

      // Begin git transaction
      await this.gitService.startTransaction();

      try {
        // Create organization with corporate hierarchy integration
        const org = await this.orgRepo.create({
          name: name!,
          description: description,
          corporateLevel: corporateLevel || 'ORGANIZATION' as any,
          settings: {
            classification: classification || 'UNCLASSIFIED' as any,
            requiresApproval: requiresApproval || false,
            defaultAccessLevel: 'OBSERVER' as any
          },
          createdBy: session.user.id,
          version: '1.0.0'
        });

        // Create organization directory structure (README only, repository handles the data file)
        await this.createOrganizationStructure(org);

        // Add creator as organization member with CEO role
        await this.authService.addUserToOrganization(
          session.user.id,
          org.id,
          'CEO' as any,
          session.user.id
        );

        // Commit changes
        await this.gitService.commitTransaction(
          `feat: Create organization ${org.name}`,
          `Organization: ${org.name}
Corporate Level: ${org.corporateLevel}
Classification: ${org.settings.classification}

Created-By: ${session.user.email}
[${session.user.systemRole}]

System Role: ${session.user.systemRole}`
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

    // Create organization directory
    await fs.ensureDir(orgPath);

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

    // Add README to git transaction (encrypted file is handled by repository)
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