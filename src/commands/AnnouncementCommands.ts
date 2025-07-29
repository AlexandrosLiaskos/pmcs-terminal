import chalk from 'chalk';
import Table from 'cli-table3';
import { AuthenticationService } from '../services/AuthenticationService';
import { Repository, Announcement, CreateAnnouncementOptions, ListOptions, ShowOptions } from '../types';
import { GitService } from '../services/GitService';

export class AnnouncementCommands {
  constructor(
    private authService: AuthenticationService,
    private announcementRepo: Repository<Announcement>,
    private gitService: GitService
  ) {}

  async create(options: CreateAnnouncementOptions & { entityType: string; entityId: string }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();

      // Validate announcement permissions
      if (!await this.authService.canCreateAnnouncement(options.entityType, options.entityId, session.user.id)) {
        throw new Error('Insufficient permissions to create announcements in this entity');
      }

      await this.gitService.startTransaction();

      try {
        // Create announcement
        const announcement = await this.announcementRepo.create({
          title: options.title,
          content: options.content,
          entityType: options.entityType as any,
          entityId: options.entityId,
          type: options.type || 'GENERAL' as any,
          priority: options.priority || 'MEDIUM' as any,
          publishedAt: options.publishNow ? new Date() : undefined,
          corporateContext: {
            authorRole: session.corporateContext.role,
            authorLevel: session.corporateContext.level,
            classification: session.corporateContext.classification,
            approvalRequired: false,
            approvedBy: []
          },
          readBy: [],
          createdBy: session.user.id,
          version: '1.0.0'
        });

        // Create announcement file in entity context
        await this.createAnnouncementFile(announcement);

        // Commit changes
        await this.gitService.commitTransaction(
          `feat: Create announcement ${announcement.title}`,
          `Announcement: ${announcement.title}
Entity: ${announcement.entityType}/${announcement.entityId}
Type: ${announcement.type}
Priority: ${announcement.priority}
Author: ${session.user.email} [${session.corporateContext.role}]

Classification: ${session.corporateContext.classification}`
        );

        console.log(chalk.green(`✅ Announcement '${announcement.title}' created successfully`));
        console.log(chalk.gray(`📢 Type: ${announcement.type}`));
        console.log(chalk.gray(`⚡ Priority: ${announcement.priority}`));
        if (announcement.publishedAt) {
          console.log(chalk.gray(`📅 Published: ${announcement.publishedAt.toLocaleString()}`));
        } else {
          console.log(chalk.gray(`📝 Status: Draft`));
        }

      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to create announcement:'), error.message);
      process.exit(1);
    }
  }

  async list(options: ListOptions & { entityType?: string; entityId?: string; unread?: boolean } = {}): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();

      // Determine announcement scope based on options and permissions
      let announcements: Announcement[];

      if (options.entityType && options.entityId) {
        // Check if user can view announcements in this entity
        if (!await this.authService.canAccessEntity(options.entityType, options.entityId, session.user.id)) {
          throw new Error('Access denied to view announcements in this entity');
        }
        announcements = await this.announcementRepo.findByEntity!(options.entityType, options.entityId);
      } else {
        // Show all announcements user has access to
        announcements = await this.announcementRepo.findAllUserVisible(session.user.id);
      }

      // Filter by unread if specified
      if (options.unread) {
        announcements = announcements.filter(a => !(a.readBy || []).includes(session.user.id));
      }

      // Only show published announcements unless user is admin
      if (!session.permissions.canManageAnnouncements) {
        announcements = announcements.filter(a => a.publishedAt);
      }

      if (announcements.length === 0) {
        console.log(chalk.yellow('📢 No announcements found'));
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(announcements, null, 2));
        return;
      }

      console.log(chalk.cyan(`\n📢 Announcements (${announcements.length}):\n`));

      // Group by type for better organization
      const groupedAnnouncements = announcements.reduce((acc, announcement) => {
        const type = announcement.type;
        if (!acc[type]) acc[type] = [];
        acc[type].push(announcement);
        return acc;
      }, {} as Record<string, Announcement[]>);

      Object.entries(groupedAnnouncements).forEach(([type, typeAnnouncements]) => {
        console.log(chalk.bold(`\n${this.getTypeIcon(type)} ${type} (${typeAnnouncements.length}):`));

        const table = new Table({
          head: [
            chalk.bold('ID'),
            chalk.bold('Title'),
            chalk.bold('Priority'),
            chalk.bold('Published'),
            chalk.bold('Status'),
            chalk.bold('Entity')
          ],
          colWidths: [12, 30, 10, 12, 10, 25]
        });

        typeAnnouncements.slice(0, 10).forEach(announcement => {
          const isRead = (announcement.readBy || []).includes(session.user.id);
          const status = announcement.publishedAt ? (isRead ? 'Read' : 'Unread') : 'Draft';
          
          table.push([
            announcement.id.substring(0, 8) + '...',
            announcement.title.length > 27 ? announcement.title.substring(0, 24) + '...' : announcement.title,
            announcement.priority,
            announcement.publishedAt ? announcement.publishedAt.toLocaleDateString() : 'Not published',
            isRead ? chalk.gray(status) : chalk.yellow(status),
            `${announcement.entityType}/${announcement.entityId.substring(0, 8)}...`
          ]);
        });

        console.log(table.toString());

        if (typeAnnouncements.length > 10) {
          console.log(chalk.gray(`... and ${typeAnnouncements.length - 10} more`));
        }
      });

      // Show quick actions
      console.log(chalk.gray('\n💡 Quick Actions:'));
      console.log(chalk.gray('  pmcs announcements show <id>    - View announcement details'));
      console.log(chalk.gray('  pmcs announcements list --unread - Show unread announcements'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list announcements:'), error.message);
      process.exit(1);
    }
  }

  async show(id: string, options: ShowOptions = {}): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      const announcement = await this.announcementRepo.findById(id);

      if (!announcement) {
        throw new Error(`Announcement with ID '${id}' not found`);
      }

      // Check access permissions
      if (!await this.authService.canAccessEntity(announcement.entityType, announcement.entityId, session.user.id)) {
        throw new Error('Access denied to view this announcement');
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(announcement, null, 2));
        return;
      }

      // Mark as read if not already
      if (!(announcement.readBy || []).includes(session.user.id)) {
        await this.markAsRead(announcement, session.user.id);
      }

      // Display announcement details
      console.log(chalk.cyan(`\n📢 ${announcement.type}: ${announcement.title}`));
      console.log(`\n${announcement.content}\n`);
      console.log(`🔑 ID: ${announcement.id}`);
      console.log(`⚡ Priority: ${announcement.priority}`);
      console.log(`🎯 Entity: ${announcement.entityType}/${announcement.entityId}`);
      console.log(`📅 Created: ${announcement.createdAt.toLocaleDateString()}`);
      
      if (announcement.publishedAt) {
        console.log(`📅 Published: ${announcement.publishedAt.toLocaleDateString()}`);
      } else {
        console.log(chalk.yellow(`📝 Status: Draft`));
      }

      console.log(`👥 Read by ${(announcement.readBy || []).length} people`);

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to show announcement:'), error.message);
      process.exit(1);
    }
  }

  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      'GENERAL': '📢',
      'URGENT': '🚨',
      'POLICY': '📋',
      'SYSTEM': '⚙️',
      'MAINTENANCE': '🔧'
    };
    return icons[type] || '📢';
  }

  private async createAnnouncementFile(announcement: Announcement): Promise<void> {
    const fs = await import('fs-extra');
    const entityPath = `${announcement.entityType}s/${announcement.entityId}`;
    const announcementPath = `${entityPath}/announcements/${announcement.id}.json`;

    await fs.ensureDir(`${entityPath}/announcements`);
    await fs.writeJSON(announcementPath, {
      ...announcement,
      entityType: 'announcement',
      version: '1.0.0',
      lastModified: new Date().toISOString()
    }, { spaces: 2 });

    this.gitService.addToTransaction(announcementPath);
  }

  private async markAsRead(announcement: Announcement, userId: string): Promise<void> {
    try {
      if (!announcement.readBy) announcement.readBy = [];
      announcement.readBy.push(userId);
      await this.announcementRepo.update(announcement.id, { readBy: announcement.readBy });
    } catch (error: any) {
      // Don't fail the show command if marking as read fails
      console.log(chalk.gray('Note: Could not mark announcement as read'));
    }
  }
}