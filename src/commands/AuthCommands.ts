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
      console.log(chalk.gray(`Role: ${session.user.role}`));
      console.log(chalk.gray(`Corporate Level: ${session.user.corporateLevel}`));
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

  async status(): Promise<void> {
    try {
      const status = await this.authService.getSessionStatus();
      
      if (status.authenticated) {
        console.log(chalk.green('🔓 Authenticated'));
        console.log(chalk.white(`User: ${status.user!.name} (${status.user!.email})`));
        console.log(chalk.gray(`Role: ${status.user!.role}`));
        console.log(chalk.gray(`Corporate Level: ${status.user!.corporateLevel}`));
        console.log(chalk.gray(`Session expires: ${status.expiresAt!.toLocaleString()}`));
        
        // Show permissions
        if (status.user!.permissions.length > 0) {
          console.log(chalk.cyan('\n🔐 Permissions:'));
          status.user!.permissions.forEach(permission => {
            console.log(chalk.gray(`  • ${permission}`));
          });
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