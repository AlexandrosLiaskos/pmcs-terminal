import chalk from 'chalk';
import Table from 'cli-table3';
import { AuthenticationService } from '../services/AuthenticationService';
import { Repository, Assignment, CreateAssignmentOptions, ListOptions, ShowOptions } from '../types';
import { GitService } from '../services/GitService';

export class AssignmentCommands {
  constructor(
    private authService: AuthenticationService,
    private assignmentRepo: Repository<Assignment>,
    private gitService: GitService
  ) {}

  async create(options: CreateAssignmentOptions & { entityType: string; entityId: string; organizationId?: string }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();

      // For now, require organizationId to be provided
      if (!options.organizationId) {
        throw new Error('Organization ID is required for creating assignments');
      }

      // Validate assignment permissions in the specific organization
      if (!await this.authService.canCreateAssignment(options.organizationId, session.user.id)) {
        throw new Error('Insufficient permissions to create assignments in this organization');
      }

      await this.gitService.startTransaction();

      try {
        // Get user's corporate level in this organization
        const orgMembership = session.organizationMemberships.find(m => m.organizationId === options.organizationId);
        const corporateLevel = orgMembership?.corporateLevel || 'MEMBER' as any;

        // Create assignment
        const assignment = await this.assignmentRepo.create({
          title: options.title,
          description: options.description,
          entityType: options.entityType as any,
          entityId: options.entityId,
          assignerEmail: session.user.email,
          assigneeEmail: options.assigneeEmail,
          priority: options.priority || 'MEDIUM' as any,
          dueDate: options.dueDate,
          corporateContext: {
            assignerRole: session.user.systemRole,
            assignerLevel: corporateLevel,
            requiresApproval: false, // Simple implementation
            approvalChain: []
          },
          status: 'ASSIGNED' as any,
          createdBy: session.user.id,
          version: '1.0.0'
        });

        // Create assignment file in entity context
        await this.createAssignmentFile(assignment);

        // Commit changes
        await this.gitService.commitTransaction(
          `feat: Create assignment ${assignment.title}`,
          `Assignment: ${assignment.title}
Entity: ${assignment.entityType}/${assignment.entityId}
Organization: ${options.organizationId}
Assigner: ${assignment.assignerEmail} [${corporateLevel}]
Assignee: ${assignment.assigneeEmail}
Status: ${assignment.status}

System Role: ${session.user.systemRole}`
        );

        console.log(chalk.green(`✅ Assignment '${assignment.title}' created successfully`));
        console.log(chalk.gray(`👤 Assigned to: ${assignment.assigneeEmail}`));
        console.log(chalk.gray(`📊 Status: ${assignment.status}`));

      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to create assignment:'), error.message);
      process.exit(1);
    }
  }

  async list(options: ListOptions & { entityType?: string; entityId?: string } = {}): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();

      // Determine assignment scope based on options and permissions
      let assignments: Assignment[];

      if (options.assignedToMe) {
        assignments = await this.assignmentRepo.findByAssignee!(session.user.email);
      } else if (options.assignedByMe) {
        assignments = await this.assignmentRepo.findByAssigner!(session.user.email);
      } else if (options.entityType && options.entityId) {
        // Check if user can view assignments in this entity
        if (!await this.authService.canAccessEntity(options.entityType, options.entityId, session.user.id)) {
          throw new Error('Access denied to view assignments in this entity');
        }
        assignments = await this.assignmentRepo.findByEntity!(options.entityType, options.entityId);
      } else {
        // Show all assignments user has access to
        assignments = await this.assignmentRepo.findAllUserVisible(session.user.id);
      }

      if (assignments.length === 0) {
        console.log(chalk.yellow('📋 No assignments found'));
        return;
      }

      // Filter by status if specified
      if (options.status) {
        assignments = assignments.filter(a => a.status === (options.status as any));
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(assignments, null, 2));
        return;
      }

      console.log(chalk.cyan(`\n📋 Assignments (${assignments.length}):\n`));

      // Group by status for better organization
      const groupedAssignments = assignments.reduce((acc, assignment) => {
        const status = assignment.status;
        if (!acc[status]) acc[status] = [];
        acc[status].push(assignment);
        return acc;
      }, {} as Record<string, Assignment[]>);

      Object.entries(groupedAssignments).forEach(([status, statusAssignments]) => {
        console.log(chalk.bold(`\n${this.getStatusIcon(status)} ${status} (${statusAssignments.length}):`));

        const table = new Table({
          head: [
            chalk.bold('ID'),
            chalk.bold('Title'),
            chalk.bold('Assignee'),
            chalk.bold('Due Date'),
            chalk.bold('Priority'),
            chalk.bold('Entity')
          ],
          colWidths: [12, 30, 20, 12, 10, 25]
        });

        statusAssignments.slice(0, 10).forEach(assignment => {
          table.push([
            assignment.id.substring(0, 8) + '...',
            assignment.title.length > 27 ? assignment.title.substring(0, 24) + '...' : assignment.title,
            assignment.assigneeEmail,
            assignment.dueDate ? assignment.dueDate.toLocaleDateString() : 'No due date',
            assignment.priority,
            `${assignment.entityType}/${assignment.entityId.substring(0, 8)}...`
          ]);
        });

        console.log(table.toString());

        if (statusAssignments.length > 10) {
          console.log(chalk.gray(`... and ${statusAssignments.length - 10} more`));
        }
      });

      // Show quick actions
      console.log(chalk.gray('\n💡 Quick Actions:'));
      console.log(chalk.gray('  pmcs assignments show <id>           - View assignment details'));
      console.log(chalk.gray('  pmcs assignments list --assigned-to-me - Show my assignments'));
      console.log(chalk.gray('  pmcs assignments list --assigned-by-me - Show assignments I created'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list assignments:'), error.message);
      process.exit(1);
    }
  }

  async show(id: string, options: ShowOptions = {}): Promise<void> {
    try {
      const assignment = await this.assignmentRepo.findById(id);

      if (!assignment) {
        throw new Error(`Assignment with ID '${id}' not found`);
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(assignment, null, 2));
        return;
      }

      // Display assignment details
      console.log(chalk.cyan(`\n📋 Assignment: ${assignment.title}`));
      console.log(`📝 Description: ${assignment.description || 'No description'}`);
      console.log(`🔑 ID: ${assignment.id}`);
      console.log(`👤 Assignee: ${assignment.assigneeEmail}`);
      console.log(`👨‍💼 Assigner: ${assignment.assignerEmail}`);
      console.log(`⚡ Priority: ${assignment.priority}`);
      console.log(`📊 Status: ${assignment.status}`);
      console.log(`🎯 Entity: ${assignment.entityType}/${assignment.entityId}`);
      console.log(`📅 Created: ${assignment.createdAt.toLocaleDateString()}`);
      
      if (assignment.dueDate) {
        console.log(`⏰ Due Date: ${assignment.dueDate.toLocaleDateString()}`);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to show assignment:'), error.message);
      process.exit(1);
    }
  }

  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'PENDING_APPROVAL': '⏳',
      'ASSIGNED': '📋',
      'IN_PROGRESS': '🔄',
      'COMPLETED': '✅',
      'CANCELLED': '❌',
      'OVERDUE': '🚨'
    };
    return icons[status] || '📋';
  }

  private async createAssignmentFile(assignment: Assignment): Promise<void> {
    const fs = await import('fs-extra');
    const entityPath = `${assignment.entityType}s/${assignment.entityId}`;
    const assignmentPath = `${entityPath}/assignments/${assignment.id}.json`;

    await fs.ensureDir(`${entityPath}/assignments`);
    await fs.writeJSON(assignmentPath, {
      ...assignment,
      entityType: 'assignment',
      version: '1.0.0',
      lastModified: new Date().toISOString()
    }, { spaces: 2 });

    this.gitService.addToTransaction(assignmentPath);
  }
}