import chalk from 'chalk';
import inquirer from 'inquirer';
import { AuthenticationService } from '../services/AuthenticationService';

export class AuthCommands {
  constructor(private authService: AuthenticationService) {}

  async login(options: { email?: string; password?: string }): Promise<void> {
    try {
      let email = options.email;
      let password = options.password;

      // If credentials not provided via options, prompt for them
      if (!email || !password) {
        console.log(chalk.cyan('🔐 PMCS Authentication\n'));
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'email',
            message: 'Email:',
            when: !email,
            validate: (input: string) => {
              if (!input.includes('@')) {
                return 'Please enter a valid email address';
              }
              return true;
            }
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            when: !password,
            mask: '*'
          }
        ]);

        email = email || answers.email;
        password = password || answers.password;
      }

      // Attempt authentication
      const session = await this.authService.authenticate({ email: email!, password: password! });
      
      console.log(chalk.green('✅ Authentication successful!'));
      console.log(chalk.white(`Welcome, ${session.user.name}`));
      console.log(chalk.gray(`System Role: ${session.user.systemRole}`));
      console.log(chalk.gray(`Organizations: ${session.organizationMemberships.length} memberships`));
      console.log(chalk.gray(`Session expires: ${session.expiresAt.toLocaleString()}\n`));

    } catch (error: any) {
      console.error(chalk.red('❌ Authentication failed:'), error.message);
      
      if (error.message?.includes('Invalid email or password')) {
        console.log(chalk.yellow('\n💡 Default credentials:'));
        console.log(chalk.gray('  Admin: admin@pmcs.local / admin123'));
        console.log(chalk.gray('  User:  user@pmcs.local / user123'));
      }
      
      process.exit(1);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      console.log(chalk.green('✅ Successfully logged out'));
    } catch (error: any) {
      console.error(chalk.red('❌ Logout failed:'), error.message);
      process.exit(1);
    }
  }

  async register(options: { 
    email?: string; 
    password?: string; 
    name?: string;
    systemRole?: string;
  }): Promise<void> {
    try {
      // Check if this is the first user
      const isFirst = await this.authService.isFirstUser();
      
      let { email, password, name, systemRole } = options;

      // If details not provided via options, prompt for them
      if (!email || !password || !name) {
        if (isFirst) {
          console.log(chalk.cyan('🎉 Welcome! Setting up PMCS System Owner Account\n'));
          console.log(chalk.yellow('This is the first user registration - you will become the System Owner with full control.\n'));
        } else {
          console.log(chalk.cyan('📝 PMCS User Registration\n'));
        }
        
        const prompts = [
          {
            type: 'input',
            name: 'name',
            message: 'Full Name:',
            when: !name,
            validate: (input: string) => {
              if (input.trim().length < 2) {
                return 'Name must be at least 2 characters';
              }
              return true;
            }
          },
          {
            type: 'input',
            name: 'email',
            message: 'Email:',
            when: !email,
            validate: (input: string) => {
              if (!input.includes('@')) {
                return 'Please enter a valid email address';
              }
              return true;
            }
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            when: !password,
            mask: '*',
            validate: (input: string) => {
              if (input.length < 6) {
                return 'Password must be at least 6 characters';
              }
              return true;
            }
          }
        ];

        // Only ask for system role if not first user
        if (!isFirst && !systemRole) {
          prompts.push({
            type: 'list',
            name: 'systemRole',
            message: 'System Role:',
            choices: [
              { name: 'System Member (Basic access)', value: 'system.member' },
              { name: 'System Admin (Can register users, create orgs)', value: 'system.admin' }
            ],
            default: 'system.member'
          } as any);
        }

        const answers = await inquirer.prompt(prompts);

        name = name || answers.name;
        email = email || answers.email;
        password = password || answers.password;
        systemRole = systemRole || answers.systemRole;
      }

      // Register the user
      const user = await this.authService.register({
        name: name!,
        email: email!,
        password: password!,
        systemRole: systemRole as any
      });
      
      console.log(chalk.green('✅ User registered successfully!'));
      console.log(chalk.white(`Name: ${user.name}`));
      console.log(chalk.gray(`Email: ${user.email}`));
      console.log(chalk.gray(`System Role: ${user.systemRole}`));
      
      if (isFirst) {
        console.log(chalk.yellow('\n🎉 Congratulations! You are now the System Owner!'));
        console.log(chalk.white('You have full control over the PMCS system including:'));
        console.log(chalk.gray('  • Register new users'));
        console.log(chalk.gray('  • Create organizations'));
        console.log(chalk.gray('  • Manage system settings'));
      }
      
      console.log(chalk.yellow('\n💡 You can now login with these credentials'));

    } catch (error: any) {
      console.error(chalk.red('❌ Registration failed:'), error.message);
      process.exit(1);
    }
  }

  async status(): Promise<void> {
    try {
      const status = await this.authService.getSessionStatus();
      
      if (status.authenticated) {
        console.log(chalk.green('🔓 Authenticated'));
        console.log(chalk.white(`User: ${status.user!.name} (${status.user!.email})`));
        console.log(chalk.gray(`System Role: ${status.systemRole}`));
        console.log(chalk.gray(`Organizations: ${status.organizationCount} memberships`));
        console.log(chalk.gray(`Session expires: ${status.expiresAt!.toLocaleString()}`));
        
        // Show system permissions
        if (status.systemPermissions) {
          console.log(chalk.cyan('\n🛡️  System Permissions:'));
          if (status.systemPermissions.canRegisterUsers) {
            console.log(chalk.gray('  • Register new users'));
          }
          if (status.systemPermissions.canCreateOrganizations) {
            console.log(chalk.gray('  • Create organizations'));
          }
          if (status.systemPermissions.canManageSystem) {
            console.log(chalk.gray('  • Manage system settings'));
          }
          if (status.systemPermissions.canDeleteOrganizations) {
            console.log(chalk.gray('  • Delete organizations'));
          }
          
          const hasAnyPermission = Object.values(status.systemPermissions).some(Boolean);
          if (!hasAnyPermission) {
            console.log(chalk.gray('  • Basic system access only'));
          }
        }
        
      } else {
        console.log(chalk.red('🔒 Not authenticated'));
        console.log(chalk.yellow('Run "pmcs auth login" to authenticate'));
      }
    } catch (error) {
      console.log(chalk.red('🔒 Not authenticated'));
      console.log(chalk.yellow('Run "pmcs auth login" to authenticate'));
    }
  }
}