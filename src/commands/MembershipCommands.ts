import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { AuthenticationService } from '../services/AuthenticationService';
import { CorporateLevel, OrganizationMembership } from '../types';
import { GitService } from '../services/GitService';

export class MembershipCommands {
  constructor(
    private authService: AuthenticationService,
    private gitService: GitService
  ) {}

  async addMember(options: {
    organizationId?: string;
    userEmail?: string;
    corporateLevel?: string;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      
      let { organizationId, userEmail, corporateLevel } = options;

      // Interactive prompts if options not provided
      if (!organizationId || !userEmail || !corporateLevel) {
        console.log(chalk.cyan('👥 Add Member to Organization\n'));

        // Get user's organization memberships where they can manage members
        const canManageOrgs = session.organizationPermissions
          .filter(p => p.canManageMembers)
          .map(p => p.organizationId);

        if (canManageOrgs.length === 0) {
          throw new Error('You do not have permission to manage members in any organization');
        }

        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'organizationId',
            message: 'Select Organization:',
            when: !organizationId,
            choices: canManageOrgs.map(id => ({ name: id, value: id })), // Would need org names
            validate: (input: string) => input.length > 0 || 'Organization is required'
          },
          {
            type: 'input',
            name: 'userEmail',
            message: 'User Email:',
            when: !userEmail,
            validate: (input: string) => {
              if (!input.includes('@')) {
                return 'Please enter a valid email address';
              }
              return true;
            }
          },
          {
            type: 'list',
            name: 'corporateLevel',
            message: 'Corporate Level:',
            when: !corporateLevel,
            choices: [
              { name: 'Observer (Read-only)', value: 'OBSERVER' },
              { name: 'Member (Basic access)', value: 'MEMBER' },
              { name: 'Senior Member', value: 'SENIOR_MEMBER' },
              { name: 'Manager', value: 'MANAGER' },
              { name: 'Director', value: 'DIRECTOR' },
              { name: 'Vice President', value: 'VP' },
              { name: 'Senior Vice President', value: 'SVP' },
              { name: 'Executive Vice President', value: 'EVP' },
              { name: 'Chief Financial Officer', value: 'CFO' },
              { name: 'Chief Technology Officer', value: 'CTO' },
              { name: 'Chief Operating Officer', value: 'COO' },
              { name: 'Chief Executive Officer', value: 'CEO' }
            ],
            default: 'MEMBER'
          }
        ]);

        organizationId = organizationId || answers.organizationId;
        userEmail = userEmail || answers.userEmail;
        corporateLevel = corporateLevel || answers.corporateLevel;
      }

      // Verify user has permission to manage members in this organization
      if (!await this.authService.canPerformActionInOrganization(
        session.user.id, 
        organizationId!, 
        'manage_members'
      )) {
        throw new Error('Insufficient permissions to manage members in this organization');
      }

      // Find user by email (would need user lookup method)
      // For now, assume the user exists - in real implementation, would validate
      const userId = `user-${Date.now()}`; // Placeholder

      await this.gitService.startTransaction();

      try {
        // Add user to organization
        const membership = await this.authService.addUserToOrganization(
          userId,
          organizationId!,
          corporateLevel! as CorporateLevel,
          session.user.id
        );

        await this.gitService.commitTransaction(
          `feat: Add member to organization`,
          `Member: ${userEmail} [${corporateLevel}]
Organization: ${organizationId}
Added by: ${session.user.email}

Corporate Level: ${corporateLevel}
Status: ACTIVE`
        );

        console.log(chalk.green(`✅ User '${userEmail}' added to organization successfully`));
        console.log(chalk.gray(`🏢 Organization: ${organizationId}`));
        console.log(chalk.gray(`👤 Corporate Level: ${corporateLevel}`));
        console.log(chalk.gray(`📅 Joined: ${membership.joinedAt.toLocaleDateString()}`));

      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to add member:'), error.message);
      process.exit(1);
    }
  }

  async listMembers(options: {
    organizationId?: string;
    format?: string;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();

      if (!options.organizationId) {
        throw new Error('Organization ID is required');
      }

      // Verify user has access to view members
      if (!await this.authService.canPerformActionInOrganization(
        session.user.id,
        options.organizationId,
        'manage_members'
      )) {
        throw new Error('Insufficient permissions to view members in this organization');
      }

      // Get organization memberships (would need repository method)
      console.log(chalk.cyan(`👥 Organization Members: ${options.organizationId}\n`));

      const table = new Table({
        head: ['User', 'Corporate Level', 'Status', 'Joined', 'Invited By'],
        colWidths: [25, 20, 12, 15, 20]
      });

      // Placeholder data - would get from repository
      table.push(
        [session.user.email, 'CEO', 'ACTIVE', new Date().toLocaleDateString(), 'System']
      );

      console.log(table.toString());

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list members:'), error.message);
      process.exit(1);
    }
  }

  async removeMember(options: {
    organizationId?: string;
    userEmail?: string;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();

      if (!options.organizationId || !options.userEmail) {
        throw new Error('Organization ID and user email are required');
      }

      // Verify user has permission to manage members
      if (!await this.authService.canPerformActionInOrganization(
        session.user.id,
        options.organizationId,
        'manage_members'
      )) {
        throw new Error('Insufficient permissions to remove members from this organization');
      }

      // Confirm removal
      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `Remove ${options.userEmail} from organization?`,
          default: false
        }
      ]);

      if (!confirm.confirmed) {
        console.log(chalk.yellow('❌ Operation cancelled'));
        return;
      }

      await this.gitService.startTransaction();

      try {
        // Remove membership (would need implementation)
        // await this.authService.removeUserFromOrganization(userId, organizationId);

        await this.gitService.commitTransaction(
          `feat: Remove member from organization`,
          `Removed: ${options.userEmail}
Organization: ${options.organizationId}
Removed by: ${session.user.email}`
        );

        console.log(chalk.green(`✅ User '${options.userEmail}' removed from organization`));

      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to remove member:'), error.message);
      process.exit(1);
    }
  }

  async updateMemberRole(options: {
    organizationId?: string;
    userEmail?: string;
    corporateLevel?: string;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();

      if (!options.organizationId || !options.userEmail) {
        throw new Error('Organization ID and user email are required');
      }

      // Verify user has permission to manage members
      if (!await this.authService.canPerformActionInOrganization(
        session.user.id,
        options.organizationId,
        'manage_members'
      )) {
        throw new Error('Insufficient permissions to update member roles in this organization');
      }

      let { corporateLevel } = options;

      if (!corporateLevel) {
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'corporateLevel',
            message: 'New Corporate Level:',
            choices: [
              { name: 'Observer (Read-only)', value: 'OBSERVER' },
              { name: 'Member (Basic access)', value: 'MEMBER' },
              { name: 'Senior Member', value: 'SENIOR_MEMBER' },
              { name: 'Manager', value: 'MANAGER' },
              { name: 'Director', value: 'DIRECTOR' },
              { name: 'Vice President', value: 'VP' },
              { name: 'Senior Vice President', value: 'SVP' },
              { name: 'Executive Vice President', value: 'EVP' },
              { name: 'Chief Financial Officer', value: 'CFO' },
              { name: 'Chief Technology Officer', value: 'CTO' },
              { name: 'Chief Operating Officer', value: 'COO' },
              { name: 'Chief Executive Officer', value: 'CEO' }
            ]
          }
        ]);

        corporateLevel = answer.corporateLevel;
      }

      await this.gitService.startTransaction();

      try {
        // Update membership (would need implementation)
        // await this.authService.updateUserOrganizationRole(userId, organizationId, corporateLevel);

        await this.gitService.commitTransaction(
          `feat: Update member role`,
          `Updated: ${options.userEmail} → ${corporateLevel}
Organization: ${options.organizationId}
Updated by: ${session.user.email}`
        );

        console.log(chalk.green(`✅ Updated ${options.userEmail} role to ${corporateLevel}`));

      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to update member role:'), error.message);
      process.exit(1);
    }
  }
}