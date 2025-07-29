#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { AuthenticationService } from './services/AuthenticationService';
import { GitService } from './services/GitService';
import { RepositoryFactory } from './services/RepositoryFactory';
import { OrganizationCommands } from './commands/OrganizationCommands';
import { AssignmentCommands } from './commands/AssignmentCommands';
import { AnnouncementCommands } from './commands/AnnouncementCommands';
import { AuthCommands } from './commands/AuthCommands';
import { MembershipCommands } from './commands/MembershipCommands';
import { HelpSystem } from './utils/HelpSystem';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class PMCSApplication {
  private program: Command;
  private authService: AuthenticationService;
  private gitService: GitService;
  private repositoryFactory: RepositoryFactory;
  private helpSystem: HelpSystem;

  constructor() {
    this.program = new Command();
    this.authService = new AuthenticationService();
    this.gitService = new GitService();
    this.repositoryFactory = new RepositoryFactory(this.gitService, this.authService);
    this.helpSystem = new HelpSystem();
    
    this.setupProgram();
    this.setupCommands();
  }

  private setupProgram(): void {
    this.program
      .name('pmcs')
      .description(chalk.cyan('PMCS Terminal Application - Enterprise Project Management System'))
      .version('1.0.0')
      .configureOutput({
        writeOut: (str) => process.stdout.write(chalk.white(str)),
        writeErr: (str) => process.stderr.write(chalk.red(str))
      });

    // Global error handler
    this.program.exitOverride((err) => {
      if (err.code === 'commander.help') {
        process.exit(0);
      }
      if (err.code === 'commander.version') {
        process.exit(0);
      }
      console.error(chalk.red('Error:'), err.message);
      process.exit(1);
    });
  }

  private setupCommands(): void {
    // Authentication commands
    const authCommands = new AuthCommands(this.authService);
    const authCommand = this.program
      .command('auth')
      .description('Authentication and session management');
    
    authCommand
      .command('login')
      .description('Login to PMCS system')
      .option('-e, --email <email>', 'User email')
      .option('-p, --password <password>', 'User password')
      .action(async (options) => {
        await authCommands.login(options);
      });

    authCommand
      .command('register')
      .description('Register a new user account')
      .option('-n, --name <name>', 'Full name')
      .option('-e, --email <email>', 'User email')
      .option('-p, --password <password>', 'User password')
      .option('-s, --system-role <role>', 'System role (system.member, system.admin)')
      .action(async (options) => {
        await authCommands.register(options);
      });

    authCommand
      .command('logout')
      .description('Logout from PMCS system')
      .action(async () => {
        await authCommands.logout();
      });

    authCommand
      .command('status')
      .description('Show current authentication status')
      .action(async () => {
        await authCommands.status();
      });

    // Organization commands
    const organizationCommands = new OrganizationCommands(
      this.authService,
      this.repositoryFactory.getOrganizationRepository(),
      this.gitService
    );

    const orgCommand = this.program
      .command('organization')
      .alias('org')
      .description('Manage organizations');

    orgCommand
      .command('create')
      .description('Create a new organization (interactive prompts if options missing)')
      .option('-n, --name <name>', 'Organization name')
      .option('-d, --description <description>', 'Organization description')
      .option('-c, --classification <level>', 'Security classification', 'UNCLASSIFIED')
      .option('--corporate-level <level>', 'Corporate hierarchy level', 'ORGANIZATION')
      .option('--requires-approval', 'Require approval for changes')
      .option('-f, --format <format>', 'Output format', 'table')
      .action(async (options) => {
        await organizationCommands.create(options);
      });

    orgCommand
      .command('list')
      .description('List organizations')
      .option('-f, --format <format>', 'Output format', 'table')
      .option('--status <status>', 'Filter by status')
      .action(async (options) => {
        await organizationCommands.list(options);
      });

    orgCommand
      .command('show <id>')
      .description('Show organization details')
      .option('-f, --format <format>', 'Output format', 'table')
      .option('--detailed', 'Show detailed information')
      .action(async (id, options) => {
        await organizationCommands.show(id, options);
      });

    // Assignment commands
    const assignmentCommands = new AssignmentCommands(
      this.authService,
      this.repositoryFactory.getAssignmentRepository(),
      this.gitService
    );

    const assignmentCommand = this.program
      .command('assignments')
      .alias('assign')
      .description('Manage task assignments');

    assignmentCommand
      .command('create')
      .description('Create a new assignment')
      .requiredOption('-t, --title <title>', 'Assignment title')
      .requiredOption('--entity <entity>', 'Entity (format: type/id)')
      .requiredOption('--assignee <email>', 'Assignee email')
      .option('-d, --description <description>', 'Assignment description')
      .option('-p, --priority <priority>', 'Assignment priority', 'MEDIUM')
      .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
      .action(async (options) => {
        const [entityType, entityId] = options.entity.split('/');
        await assignmentCommands.create({
          ...options,
          entityType,
          entityId
        });
      });

    assignmentCommand
      .command('list')
      .description('List assignments')
      .option('--assigned-to-me', 'Show only assignments assigned to me')
      .option('--assigned-by-me', 'Show only assignments I created')
      .option('-s, --status <status>', 'Filter by status')
      .option('--entity <entity>', 'Filter by entity (format: type/id)')
      .option('-f, --format <format>', 'Output format', 'table')
      .action(async (options) => {
        if (options.entity) {
          const [entityType, entityId] = options.entity.split('/');
          options.entityType = entityType;
          options.entityId = entityId;
        }
        await assignmentCommands.list(options);
      });

    assignmentCommand
      .command('show <id>')
      .description('Show assignment details')
      .option('-f, --format <format>', 'Output format', 'table')
      .action(async (id, options) => {
        await assignmentCommands.show(id, options);
      });

    // Announcement commands
    const announcementCommands = new AnnouncementCommands(
      this.authService,
      this.repositoryFactory.getAnnouncementRepository(),
      this.gitService
    );

    const announcementCommand = this.program
      .command('announcements')
      .alias('announce')
      .description('Manage announcements');

    // Membership commands
    const membershipCommands = new MembershipCommands(
      this.authService,
      this.gitService
    );

    const memberCommand = this.program
      .command('members')
      .alias('member')
      .description('Manage organization memberships');


    announcementCommand
      .command('create')
      .description('Create a new announcement')
      .requiredOption('-t, --title <title>', 'Announcement title')
      .requiredOption('-c, --content <content>', 'Announcement content')
      .requiredOption('--entity <entity>', 'Entity (format: type/id)')
      .option('--subtitle <subtitle>', 'Announcement subtitle')
      .option('--type <type>', 'Announcement type', 'GENERAL')
      .option('-p, --priority <priority>', 'Priority', 'MEDIUM')
      .option('--target-audience <audience>', 'Target audience', 'ALL_MEMBERS')
      .option('--publish-now', 'Publish immediately')
      .option('--scheduled-date <date>', 'Schedule publication date')
      .action(async (options) => {
        const [entityType, entityId] = options.entity.split('/');
        await announcementCommands.create({
          ...options,
          entityType,
          entityId
        });
      });

    announcementCommand
      .command('list')
      .description('List announcements')
      .option('--entity <entity>', 'Filter by entity (format: type/id)')
      .option('--unread', 'Show only unread announcements')
      .option('-f, --format <format>', 'Output format', 'table')
      .action(async (options) => {
        if (options.entity) {
          const [entityType, entityId] = options.entity.split('/');
          options.entityType = entityType;
          options.entityId = entityId;
        }
        options.unreadOnly = options.unread;
        await announcementCommands.list(options);
      });

    // Membership commands
    memberCommand
      .command('add')
      .description('Add user to organization')
      .option('-o, --organization-id <id>', 'Organization ID')
      .option('-u, --user-email <email>', 'User email')
      .option('-l, --corporate-level <level>', 'Corporate level')
      .action(async (options) => {
        await membershipCommands.addMember(options);
      });

    memberCommand
      .command('list')
      .description('List organization members')
      .requiredOption('-o, --organization-id <id>', 'Organization ID')
      .option('-f, --format <format>', 'Output format', 'table')
      .action(async (options) => {
        await membershipCommands.listMembers(options);
      });

    memberCommand
      .command('remove')
      .description('Remove user from organization')
      .requiredOption('-o, --organization-id <id>', 'Organization ID')
      .requiredOption('-u, --user-email <email>', 'User email')
      .action(async (options) => {
        await membershipCommands.removeMember(options);
      });

    memberCommand
      .command('update-role')
      .description('Update member corporate role')
      .requiredOption('-o, --organization-id <id>', 'Organization ID')
      .requiredOption('-u, --user-email <email>', 'User email')
      .option('-l, --corporate-level <level>', 'New corporate level')
      .action(async (options) => {
        await membershipCommands.updateMemberRole(options);
      });


    // Help command
    this.program
      .command('help [command]')
      .description('Show help information')
      .action((command) => {
        if (command) {
          this.helpSystem.showCommandHelp(command);
        } else {
          this.helpSystem.showMainHelp();
        }
      });

    // Config command for setup
    this.program
      .command('init')
      .description('Initialize PMCS terminal application')
      .action(async () => {
        await this.initializeApplication();
      });
  }

  private async initializeApplication(): Promise<void> {
    console.log(chalk.cyan('🚀 Initializing PMCS Terminal Application...\n'));
    
    try {
      // Initialize git repository
      await this.gitService.initialize();
      console.log(chalk.green('✅ Git repository initialized'));

      // Create directory structure
      await this.repositoryFactory.initializeDirectoryStructure();
      console.log(chalk.green('✅ Directory structure created'));

      // Initialize encryption system automatically
      await this.initializeEncryption();
      console.log(chalk.green('✅ Encryption system initialized'));

      // Create initial configuration
      await this.createInitialConfig();
      console.log(chalk.green('✅ Configuration files created'));

      console.log(chalk.cyan('\n🎉 PMCS Terminal Application initialized successfully!'));
      console.log(chalk.yellow('\nNext steps:'));
      console.log('  1. Run "pmcs auth register" to create your first user account');
      console.log('  2. Run "pmcs auth login" to authenticate');
      console.log('  3. Run "pmcs organization create" to create your first organization');
      console.log('  4. Run "pmcs help" for more commands');

    } catch (error: any) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      process.exit(1);
    }
  }

  private async initializeEncryption(): Promise<void> {
    const fs = await import('fs-extra');
    const CryptoService = (await import('./services/CryptoService')).CryptoService;
    const KeyManager = (await import('./services/KeyManager')).KeyManager;
    
    const cryptoService = new CryptoService(this.authService);
    const keyManager = new KeyManager(this.authService);
    
    await cryptoService.initialize();
    await keyManager.initialize();
  }

  private async createInitialConfig(): Promise<void> {
    const fs = await import('fs-extra');
    
    const config = {
      version: '1.0.0',
      initialized: new Date().toISOString(),
      encryptionEnabled: true,
      settings: {
        defaultFormat: 'table',
        autoCommit: true,
        classification: 'UNCLASSIFIED'
      }
    };

    await fs.ensureDir('.pmcs');
    await fs.writeJSON('.pmcs/config.json', config, { spaces: 2 });
  }

  async run(): Promise<void> {
    try {
      await this.program.parseAsync(process.argv);
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }
}

// Run the application
const app = new PMCSApplication();
app.run().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});