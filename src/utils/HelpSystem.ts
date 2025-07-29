import chalk from 'chalk';

interface CommandHelp {
  name: string;
  description: string;
  usage: string;
  subcommands: Array<{ name: string; description: string }>;
  options: Array<{ flags: string[]; description: string }>;
  examples: Array<{ command: string; description: string }>;
}

export class HelpSystem {
  private commands: Map<string, CommandHelp> = new Map();

  constructor() {
    this.registerAllCommands();
  }

  showMainHelp(): void {
    console.log(chalk.cyan(`
🏢 PMCS Terminal Application

${chalk.bold('USAGE:')}
  pmcs <command> [subcommand] [options]

${chalk.bold('ENTITY COMMANDS:')}
  organization    Manage organizations
  portfolio       Manage portfolios  
  program         Manage programs
  project         Manage projects
  objective       Manage objectives
  keyresult       Manage key results
  initiative      Manage initiatives

${chalk.bold('UTILITY COMMANDS:')}
  assignments     Manage task assignments
  announcements   Manage announcements  

${chalk.bold('SYSTEM COMMANDS:')}
  auth            Authentication and session management
  init            Initialize PMCS terminal application
  help            Show help information

${chalk.bold('EXAMPLES:')}
  ${chalk.gray('pmcs init                              # Initialize application')}
  ${chalk.gray('pmcs auth login                        # Authenticate')}
  ${chalk.gray('pmcs organization list                 # List organizations')}
  ${chalk.gray('pmcs assignments list --assigned-to-me # Show my assignments')}
  ${chalk.gray('pmcs help organization                 # Show organization help')}

${chalk.bold('For detailed help on any command:')}
  pmcs help <command>
  pmcs <command> --help
`));
  }

  showCommandHelp(command: string): void {
    const help = this.commands.get(command);
    
    if (!help) {
      console.log(chalk.red(`❌ Unknown command: ${command}`));
      console.log('Run "pmcs help" to see all available commands.');
      return;
    }

    console.log(chalk.cyan(`\n📖 ${help.name}\n`));
    console.log(help.description);
    
    if (help.usage) {
      console.log(chalk.bold(`\nUSAGE:`));
      console.log(`  ${help.usage}`);
    }
    
    if (help.subcommands.length > 0) {
      console.log(chalk.bold('\nSUBCOMMANDS:'));
      help.subcommands.forEach(sub => {
        console.log(`  ${chalk.cyan(sub.name.padEnd(15))} ${sub.description}`);
      });
    }
    
    if (help.options.length > 0) {
      console.log(chalk.bold('\nOPTIONS:'));
      help.options.forEach(opt => {
        const flags = opt.flags.join(', ');
        console.log(`  ${chalk.yellow(flags.padEnd(20))} ${opt.description}`);
      });
    }
    
    if (help.examples.length > 0) {
      console.log(chalk.bold('\nEXAMPLES:'));
      help.examples.forEach(example => {
        console.log(`  ${chalk.gray(example.command)}`);
        console.log(`    ${example.description}\n`);
      });
    }
  }

  private registerAllCommands(): void {
    // Register auth commands
    this.commands.set('auth', {
      name: 'Authentication Management',
      description: 'Manage user authentication and sessions.',
      usage: 'pmcs auth <subcommand> [options]',
      subcommands: [
        { name: 'login', description: 'Login to PMCS system' },
        { name: 'logout', description: 'Logout from PMCS system' },
        { name: 'status', description: 'Show current authentication status' }
      ],
      options: [
        { flags: ['-e, --email'], description: 'User email (for login)' },
        { flags: ['-p, --password'], description: 'User password (for login)' }
      ],
      examples: [
        {
          command: 'pmcs auth login',
          description: 'Login with interactive prompts'
        },
        {
          command: 'pmcs auth login -e admin@pmcs.local -p admin123',
          description: 'Login with credentials'
        },
        {
          command: 'pmcs auth status',
          description: 'Check authentication status'
        }
      ]
    });

    // Register organization commands
    this.commands.set('organization', {
      name: 'Organization Management',
      description: 'Create and manage organizations with corporate hierarchy integration.',
      usage: 'pmcs organization <subcommand> [options]',
      subcommands: [
        { name: 'create', description: 'Create a new organization' },
        { name: 'list', description: 'List organizations you have access to' },
        { name: 'show', description: 'Show organization details' },
        { name: 'edit', description: 'Edit organization information' },
        { name: 'members', description: 'Manage organization members' }
      ],
      options: [
        { flags: ['-n, --name'], description: 'Organization name (required for create)' },
        { flags: ['-d, --description'], description: 'Organization description' },
        { flags: ['-c, --classification'], description: 'Security classification level' },
        { flags: ['--corporate-level'], description: 'Corporate hierarchy level' },
        { flags: ['-f, --format'], description: 'Output format (table, json, yaml)' }
      ],
      examples: [
        {
          command: 'pmcs organization create -n "Strategic Initiatives" -c SECRET',
          description: 'Create a new organization with SECRET classification'
        },
        {
          command: 'pmcs organization list --format json',
          description: 'List organizations in JSON format'
        },
        {
          command: 'pmcs organization show clh7x9k2l0000zjcq5z1b8q9f',
          description: 'Show details for specific organization'
        }
      ]
    });

    // Register assignment commands
    this.commands.set('assignments', {
      name: 'Assignment Management',
      description: 'Create and manage task assignments with corporate hierarchy validation.',
      usage: 'pmcs assignments <subcommand> [options]',
      subcommands: [
        { name: 'create', description: 'Create a new assignment' },
        { name: 'list', description: 'List assignments' },
        { name: 'show', description: 'Show assignment details' },
        { name: 'update', description: 'Update assignment status or details' }
      ],
      options: [
        { flags: ['-t, --title'], description: 'Assignment title (required for create)' },
        { flags: ['--entity'], description: 'Target entity (format: type/id)' },
        { flags: ['--assignee'], description: 'Assignee email' },
        { flags: ['--assigned-to-me'], description: 'Show only assignments assigned to me' },
        { flags: ['--assigned-by-me'], description: 'Show only assignments I created' },
        { flags: ['-s, --status'], description: 'Filter by status' },
        { flags: ['-p, --priority'], description: 'Set assignment priority' },
        { flags: ['--due-date'], description: 'Set due date (YYYY-MM-DD)' }
      ],
      examples: [
        {
          command: 'pmcs assignments create -t "Review Budget" --entity project/abc123 --assignee john@company.com',
          description: 'Create assignment in specific project'
        },
        {
          command: 'pmcs assignments list --assigned-to-me --status IN_PROGRESS',
          description: 'Show my in-progress assignments'
        }
      ]
    });

    // Register announcement commands
    this.commands.set('announcements', {
      name: 'Announcement Management',
      description: 'Create and manage announcements for teams and organizations.',
      usage: 'pmcs announcements <subcommand> [options]',
      subcommands: [
        { name: 'create', description: 'Create a new announcement' },
        { name: 'list', description: 'List announcements' },
        { name: 'show', description: 'Show announcement details' }
      ],
      options: [
        { flags: ['-t, --title'], description: 'Announcement title (required)' },
        { flags: ['-c, --content'], description: 'Announcement content (required)' },
        { flags: ['--entity'], description: 'Target entity (format: type/id)' },
        { flags: ['--type'], description: 'Announcement type (GENERAL, URGENT, POLICY, SYSTEM)' },
        { flags: ['-p, --priority'], description: 'Priority level' },
        { flags: ['--publish-now'], description: 'Publish immediately' },
        { flags: ['--unread'], description: 'Show only unread announcements' }
      ],
      examples: [
        {
          command: 'pmcs announcements create -t "System Maintenance" -c "Scheduled downtime tonight" --entity organization/org123 --publish-now',
          description: 'Create and publish announcement immediately'
        },
        {
          command: 'pmcs announcements list --unread',
          description: 'Show unread announcements'
        }
      ]
    });

    // Register init command
    this.commands.set('init', {
      name: 'Initialize Application',
      description: 'Initialize PMCS terminal application with git repository and directory structure.',
      usage: 'pmcs init',
      subcommands: [],
      options: [],
      examples: [
        {
          command: 'pmcs init',
          description: 'Initialize application in current directory'
        }
      ]
    });
  }
}