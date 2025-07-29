import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AuthenticationService } from '../services/AuthenticationService';
import { CryptoService } from '../services/CryptoService';
import { KeyManager } from '../services/KeyManager';
import { GitService } from '../services/GitService';
import { RepositoryFactory } from '../services/RepositoryFactory';
import { CorporateLevel, Classification } from '../types';

type ClassificationLevel = Classification;

export class EncryptionCommands {
  private cryptoService: CryptoService;
  private keyManager: KeyManager;
  private repositoryFactory: RepositoryFactory;

  constructor(
    private authService: AuthenticationService,
    private gitService: GitService
  ) {
    this.cryptoService = new CryptoService(authService);
    this.keyManager = new KeyManager(authService);
    this.repositoryFactory = new RepositoryFactory(gitService, authService);
  }

  async initialize(): Promise<void> {
    console.log(chalk.cyan('🔐 Initializing encryption system...'));
    
    try {
      await this.cryptoService.initialize();
      await this.keyManager.initialize();
      
      console.log(chalk.green('✅ Encryption system initialized successfully'));
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to initialize encryption:'), error.message);
      process.exit(1);
    }
  }

  async encryptFile(options: {
    filePath?: string;
    organizationId?: string;
    classification?: string;
    corporateLevel?: string;
    recursive?: boolean;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      
      let { filePath, organizationId, classification, corporateLevel } = options;
      
      if (!filePath) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'filePath',
            message: 'File or directory path to encrypt:',
            validate: async (input: string) => {
              if (!input) return 'File path is required';
              if (!await fs.pathExists(input)) return 'File or directory does not exist';
              return true;
            }
          }
        ]);
        filePath = answer.filePath;
      }
      
      if (!organizationId && session.organizationMemberships.length > 0) {
        const orgChoices = session.organizationMemberships.map(m => ({
          name: `${m.organizationId} (${m.corporateLevel})`,
          value: m.organizationId
        }));
        orgChoices.unshift({ name: 'Global (No organization)', value: '' });
        
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'organizationId',
            message: 'Select organization context:',
            choices: orgChoices
          }
        ]);
        organizationId = answer.organizationId || undefined;
      }
      
      if (!classification) {
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'classification',
            message: 'Security classification:',
            choices: [
              { name: 'Unclassified (Default)', value: 'UNCLASSIFIED' },
              { name: 'Confidential', value: 'CONFIDENTIAL' },
              { name: 'Secret', value: 'SECRET' },
              { name: 'Top Secret', value: 'TOP_SECRET' }
            ],
            default: 'UNCLASSIFIED'
          }
        ]);
        classification = answer.classification;
      }
      
      if (!corporateLevel) {
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'corporateLevel',
            message: 'Minimum corporate level required:',
            choices: [
              { name: 'Observer (Read-only)', value: 'OBSERVER' },
              { name: 'Member (Default)', value: 'MEMBER' },
              { name: 'Senior Member', value: 'SENIOR_MEMBER' },
              { name: 'Manager', value: 'MANAGER' },
              { name: 'Director', value: 'DIRECTOR' },
              { name: 'Vice President', value: 'VP' },
              { name: 'Senior Vice President', value: 'SVP' },
              { name: 'Executive Vice President', value: 'EVP' },
              { name: 'C-Level', value: 'CEO' }
            ],
            default: 'MEMBER'
          }
        ]);
        corporateLevel = answer.corporateLevel;
      }
      
      console.log(chalk.cyan('🔐 Starting encryption process...'));
      
      const stats = await fs.stat(filePath!);
      let encryptedFiles: string[] = [];
      
      await this.gitService.startTransaction();
      
      try {
        if (stats.isDirectory()) {
          if (options.recursive) {
            encryptedFiles = await this.cryptoService.encryptDirectory(
              filePath!,
              organizationId,
              classification as ClassificationLevel,
              corporateLevel as CorporateLevel
            );
          } else {
            throw new Error('Use --recursive flag to encrypt directories');
          }
        } else {
          const encryptedPath = await this.cryptoService.encryptFile(
            filePath!,
            organizationId,
            classification as ClassificationLevel,
            corporateLevel as CorporateLevel
          );
          encryptedFiles = [encryptedPath];
        }
        
        await this.gitService.commitTransaction(
          `feat: Encrypt ${stats.isDirectory() ? 'directory' : 'file'} ${path.basename(filePath!)}`,
          `Encrypted: ${filePath}\n` +
          `Files: ${encryptedFiles.length}\n` +
          `Organization: ${organizationId || 'Global'}\n` +
          `Classification: ${classification}\n` +
          `Corporate Level: ${corporateLevel}\n` +
          `Encrypted by: ${session.user.email}`
        );
        
        console.log(chalk.green(`✅ Successfully encrypted ${encryptedFiles.length} file(s)`));
        console.log(chalk.gray(`🔐 Classification: ${classification}`));
        console.log(chalk.gray(`👤 Corporate Level: ${corporateLevel}`));
        console.log(chalk.gray(`🏢 Organization: ${organizationId || 'Global'}`));
        
        if (encryptedFiles.length <= 5) {
          console.log(chalk.gray('\n📁 Encrypted files:'));
          encryptedFiles.forEach(file => {
            console.log(chalk.gray(`  • ${file}`));
          });
        } else {
          console.log(chalk.gray(`\n📁 ${encryptedFiles.length} files encrypted (use 'pmcs encryption status' to view details)`));
        }
        
      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to encrypt file(s):'), error.message);
      process.exit(1);
    }
  }

  async decryptFile(options: {
    filePath?: string;
    outputPath?: string;
    temporary?: boolean;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      
      let { filePath, outputPath } = options;
      
      if (!filePath) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'filePath',
            message: 'Encrypted file path:',
            validate: async (input: string) => {
              if (!input) return 'File path is required';
              if (!await fs.pathExists(input)) return 'File does not exist';
              if (!await this.cryptoService.isFileEncrypted(input)) {
                return 'File is not encrypted or invalid format';
              }
              return true;
            }
          }
        ]);
        filePath = answer.filePath;
      }
      
      if (!await this.cryptoService.isFileEncrypted(filePath!)) {
        throw new Error('File is not encrypted or has invalid format');
      }
      
      const metadata = await this.cryptoService.getFileMetadata(filePath!);
      if (!metadata) {
        throw new Error('Cannot read encryption metadata');
      }
      
      console.log(chalk.cyan('🔓 Decrypting file...'));
      console.log(chalk.gray(`🔐 Classification: ${metadata.classification}`));
      console.log(chalk.gray(`👤 Corporate Level: ${metadata.corporateLevel}`));
      console.log(chalk.gray(`🏢 Organization: ${metadata.organizationId || 'Global'}`));
      console.log(chalk.gray(`📅 Encrypted: ${metadata.encryptedAt.toLocaleDateString()}`));
      console.log(chalk.gray(`👨‍💻 Encrypted by: ${metadata.encryptedBy}`));
      
      if (!await this.keyManager.validateUserKeyAccess(
        session.user.id,
        metadata.organizationId,
        metadata.classification,
        metadata.corporateLevel
      )) {
        throw new Error('Insufficient permissions to decrypt this file');
      }
      
      const decryptedPath = await this.cryptoService.decryptFile(filePath!, outputPath);
      
      console.log(chalk.green(`✅ File decrypted successfully`));
      console.log(chalk.gray(`📁 Decrypted to: ${decryptedPath}`));
      console.log(chalk.gray(`📊 Original size: ${this.formatFileSize(metadata.originalSize)}`));
      
      if (options.temporary) {
        console.log(chalk.yellow(`⚠️  Temporary file created - remember to delete after use`));
      }
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to decrypt file:'), error.message);
      process.exit(1);
    }
  }

  async listEncryptedFiles(options: {
    organizationId?: string;
    classification?: string;
    format?: string;
  }): Promise<void> {
    try {
      console.log(chalk.cyan('🔐 Scanning for encrypted files...\\n'));
      
      const encryptedFiles = await this.findEncryptedFiles('.');
      
      if (encryptedFiles.length === 0) {
        console.log(chalk.yellow('📂 No encrypted files found in current directory'));
        return;
      }
      
      let filteredFiles = encryptedFiles;
      
      if (options.organizationId) {
        filteredFiles = filteredFiles.filter(f => f.metadata.organizationId === options.organizationId);
      }
      
      if (options.classification) {
        filteredFiles = filteredFiles.filter(f => f.metadata.classification === options.classification);
      }
      
      if (options.format === 'json') {
        console.log(JSON.stringify(filteredFiles, null, 2));
        return;
      }
      
      const table = new Table({
        head: [
          chalk.bold('File'),
          chalk.bold('Classification'),
          chalk.bold('Corporate Level'),
          chalk.bold('Organization'),
          chalk.bold('Size'),
          chalk.bold('Encrypted')
        ],
        colWidths: [30, 15, 15, 20, 10, 12]
      });
      
      filteredFiles.forEach(({ filePath, metadata }) => {
        table.push([
          path.basename(filePath).length > 27 ? 
            path.basename(filePath).substring(0, 24) + '...' : 
            path.basename(filePath),
          metadata.classification,
          metadata.corporateLevel,
          metadata.organizationId || 'Global',
          this.formatFileSize(metadata.originalSize),
          metadata.encryptedAt.toLocaleDateString()
        ]);
      });
      
      console.log(table.toString());
      console.log(chalk.gray(`\\nTotal: ${filteredFiles.length} encrypted file(s)`));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list encrypted files:'), error.message);
      process.exit(1);
    }
  }

  async encryptionStatus(): Promise<void> {
    try {
      console.log(chalk.cyan('🔐 Encryption System Status\\n'));
      
      await this.cryptoService.initialize();
      await this.keyManager.initialize();
      
      const keyInfo = await this.keyManager.getKeyHierarchyInfo();
      const encryptedFiles = await this.findEncryptedFiles('.');
      
      console.log(chalk.green('🔑 Key Management:'));
      console.log(`  Total Keys: ${keyInfo.totalKeys}`);
      console.log(`  Organization Keys: ${keyInfo.organizationKeys}`);
      console.log(`  User Session Keys: ${keyInfo.userSessionKeys}`);
      
      if (keyInfo.lastMasterRotation) {
        console.log(`  Last Master Rotation: ${keyInfo.lastMasterRotation.toLocaleDateString()}`);
      }
      
      console.log(`\\n📁 File Encryption:`);
      console.log(`  Encrypted Files: ${encryptedFiles.length}`);
      
      const byClassification = encryptedFiles.reduce((acc, f) => {
        acc[f.metadata.classification] = (acc[f.metadata.classification] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      Object.entries(byClassification).forEach(([classification, count]) => {
        console.log(`  ${classification}: ${count} files`);
      });
      
      if (keyInfo.nextScheduledRotations.length > 0) {
        console.log(`\\n🔄 Scheduled Key Rotations:`);
        keyInfo.nextScheduledRotations.slice(0, 3).forEach(rotation => {
          console.log(`  ${rotation.keyId} (${rotation.keyType}): ${rotation.nextRotation.toLocaleDateString()}`);
        });
      }
      
      const session = await this.authService.getCurrentSession();
      console.log(`\\n👤 Current Session:`);
      console.log(`  User: ${session.user.email}`);
      console.log(`  System Role: ${session.user.systemRole}`);
      console.log(`  Organizations: ${session.organizationMemberships.length}`);
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to get encryption status:'), error.message);
      process.exit(1);
    }
  }

  async rotateKeys(options: {
    type?: string;
    organizationId?: string;
    userId?: string;
    force?: boolean;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      
      if (session.user.systemRole !== 'system.owner' && !options.userId) {
        throw new Error('Only system owners can rotate keys (except user session keys)');
      }
      
      if (!options.force) {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `Rotate ${options.type || 'specified'} keys? This will require re-login for affected users.`,
            default: false
          }
        ]);
        
        if (!confirm.confirmed) {
          console.log(chalk.yellow('❌ Key rotation cancelled'));
          return;
        }
      }
      
      console.log(chalk.cyan('🔄 Rotating keys...'));
      
      if (options.type === 'master') {
        await this.keyManager.rotateMasterKey();
        console.log(chalk.green('✅ Master key rotated successfully'));
        console.log(chalk.yellow('⚠️  All users will need to log in again'));
      } else if (options.type === 'organization' && options.organizationId) {
        await this.keyManager.rotateOrganizationKeys(options.organizationId);
        console.log(chalk.green(`✅ Organization keys rotated for ${options.organizationId}`));
      } else if (options.type === 'user' && options.userId) {
        await this.keyManager.rotateUserSessionKeys(options.userId);
        console.log(chalk.green(`✅ User session keys rotated for ${options.userId}`));
      } else {
        await this.keyManager.checkAndPerformScheduledRotations();
        console.log(chalk.green('✅ Scheduled key rotations completed'));
      }
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to rotate keys:'), error.message);
      process.exit(1);
    }
  }

  async startSession(): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      
      console.log(chalk.cyan('🔓 Starting decryption session...'));
      
      await this.cryptoService.startDecryptionSession(session.user.id);
      
      console.log(chalk.green('✅ Decryption session started'));
      console.log(chalk.gray('📝 Session will expire in 4 hours'));
      console.log(chalk.gray('💡 Files will be automatically decrypted when accessed'));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to start session:'), error.message);
      process.exit(1);
    }
  }

  async endSession(): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      
      await this.cryptoService.endDecryptionSession(session.user.id);
      
      console.log(chalk.green('✅ Decryption session ended'));
      console.log(chalk.gray('🔐 Files are now secured'));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to end session:'), error.message);
      process.exit(1);
    }
  }

  async migrateToEncryption(options: {
    force?: boolean;
    dryRun?: boolean;
  }): Promise<void> {
    try {
      const session = await this.authService.getCurrentSession();
      
      if (session.user.systemRole !== 'system.owner') {
        throw new Error('Only system owners can perform encryption migration');
      }
      
      console.log(chalk.cyan('🔄 Analyzing current data for encryption migration...\\n'));
      
      const status = await this.repositoryFactory.getEncryptionStatus();
      
      console.log(chalk.blue('📊 Current Encryption Status:'));
      console.log(`  Repositories: ${status.totalRepositories}`);
      console.log(`  Fully Encrypted: ${status.encryptedRepositories}`);
      console.log(`  Overall Progress: ${status.encryptionPercentage.toFixed(1)}%\\n`);
      
      const table = new Table({
        head: [
          chalk.bold('Repository'),
          chalk.bold('Total Files'),
          chalk.bold('Encrypted'),
          chalk.bold('Progress')
        ],
        colWidths: [15, 12, 12, 12]
      });
      
      status.repositoryStatus.forEach(repo => {
        const progress = repo.totalFiles > 0 ? 
          `${repo.encryptionPercentage.toFixed(1)}%` : 
          'No files';
        
        table.push([
          repo.repository,
          repo.totalFiles.toString(),
          repo.encryptedFiles.toString(),
          repo.encryptionPercentage === 100 ? 
            chalk.green(progress) :
            repo.encryptionPercentage === 0 ?
              chalk.red(progress) :
              chalk.yellow(progress)
        ]);
      });
      
      console.log(table.toString());
      
      const unencryptedRepos = status.repositoryStatus.filter(r => 
        r.totalFiles > 0 && r.encryptionPercentage < 100
      );
      
      if (unencryptedRepos.length === 0) {
        console.log(chalk.green('\\n✅ All repositories are already fully encrypted!'));
        return;
      }
      
      if (options.dryRun) {
        console.log(chalk.yellow('\\n🔍 Dry run mode - no changes will be made'));
        console.log(`Would encrypt ${unencryptedRepos.length} repositories with unencrypted files`);
        return;
      }
      
      if (!options.force) {
        console.log(chalk.yellow(`\\n⚠️  Migration will encrypt ${unencryptedRepos.length} repositories`));
        console.log(chalk.gray('This operation will:'));
        console.log(chalk.gray('  • Encrypt all unencrypted files'));
        console.log(chalk.gray('  • Replace original files with encrypted versions'));
        console.log(chalk.gray('  • Commit changes to git'));
        console.log(chalk.gray('  • Files will only be accessible after decryption'));
        
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Proceed with encryption migration?',
            default: false
          }
        ]);
        
        if (!confirm.confirmed) {
          console.log(chalk.yellow('❌ Migration cancelled'));
          return;
        }
      }
      
      console.log(chalk.cyan('\\n🔐 Starting encryption migration...'));
      
      await this.gitService.startTransaction();
      
      try {
        const result = await this.repositoryFactory.migrateToEncryptedStorage();
        
        await this.gitService.commitTransaction(
          'feat: Migrate data to encrypted storage',
          `Migration completed\\n` +
          `Files encrypted: ${result.migrated.length}\\n` +
          `Errors: ${result.errors.length}\\n` +
          `Migrated by: ${session.user.email}\\n\\n` +
          `Security: All data is now encrypted with AES-256-GCM\\n` +
          `Access: Files require proper authentication and permissions to decrypt`
        );
        
        console.log(chalk.green(`\\n✅ Migration completed successfully!`));
        console.log(chalk.gray(`📁 Files encrypted: ${result.migrated.length}`));
        
        if (result.errors.length > 0) {
          console.log(chalk.yellow(`\\n⚠️  ${result.errors.length} error(s) occurred:`));
          result.errors.slice(0, 5).forEach(error => {
            console.log(chalk.gray(`  • ${error.repository}: ${error.error}`));
          });
          
          if (result.errors.length > 5) {
            console.log(chalk.gray(`  ... and ${result.errors.length - 5} more`));
          }
        }
        
        console.log(chalk.cyan('\\n🔑 Important:'));
        console.log(chalk.gray('  • Run "pmcs encryption start-session" to access encrypted files'));
        console.log(chalk.gray('  • Use "pmcs encryption status" to monitor encryption status'));
        console.log(chalk.gray('  • Files are now secure even when uploaded to GitHub'));
        
      } catch (error: any) {
        await this.gitService.rollbackTransaction();
        throw error;
      }
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to migrate to encryption:'), error.message);
      process.exit(1);
    }
  }

  private async findEncryptedFiles(dir: string): Promise<Array<{
    filePath: string;
    metadata: any;
  }>> {
    const encryptedFiles: Array<{ filePath: string; metadata: any }> = [];
    
    const searchDirectory = async (currentDir: string): Promise<void> => {
      try {
        const items = await fs.readdir(currentDir);
        
        for (const item of items) {
          const itemPath = path.join(currentDir, item);
          const stats = await fs.stat(itemPath);
          
          if (stats.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            await searchDirectory(itemPath);
          } else if (stats.isFile() && item.endsWith('.encrypted')) {
            const metadata = await this.cryptoService.getFileMetadata(itemPath);
            if (metadata) {
              encryptedFiles.push({ filePath: itemPath, metadata });
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    await searchDirectory(dir);
    return encryptedFiles;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size * 10) / 10}${units[unitIndex]}`;
  }
}