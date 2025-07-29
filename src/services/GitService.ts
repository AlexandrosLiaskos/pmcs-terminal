import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';

export class GitService {
  private git: SimpleGit;
  private transactionActive: boolean = false;
  private transactionFiles: string[] = [];

  constructor(workingDir: string = process.cwd()) {
    this.git = simpleGit(workingDir);
  }

  async initialize(): Promise<void> {
    try {
      // Check if already a git repository
      const isRepo = await this.git.checkIsRepo();
      
      if (!isRepo) {
        // Initialize git repository
        await this.git.init();
        
        // Create .gitignore
        const gitignore = `
# PMCS Terminal Application
node_modules/
dist/
*.log
.env
.env.local

# Session and temporary files
.pmcs/session.json
.pmcs/temp/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
`;
        await fs.writeFile('.gitignore', gitignore.trim());
        
        // Initial commit
        await this.git.add('.gitignore');
        await this.git.commit('Initial commit: PMCS Terminal Application setup');
        
        console.log('Git repository initialized successfully');
      }
    } catch (error: any) {
      throw new Error(`Git initialization failed: ${error.message}`);
    }
  }

  async startTransaction(): Promise<void> {
    if (this.transactionActive) {
      throw new Error('Transaction already active');
    }
    
    this.transactionActive = true;
    this.transactionFiles = [];
  }

  async commitTransaction(message: string, body?: string): Promise<string> {
    if (!this.transactionActive) {
      throw new Error('No transaction active');
    }

    try {
      if (this.transactionFiles.length === 0) {
        throw new Error('No files to commit in transaction');
      }

      // Add files to git
      await this.git.add(this.transactionFiles);

      // Create commit message
      const commitMessage = body ? `${message}\n\n${body}` : message;

      // Commit changes
      const result = await this.git.commit(commitMessage);
      
      // Clear transaction state
      this.transactionActive = false;
      this.transactionFiles = [];

      return result.commit;
    } catch (error: any) {
      await this.rollbackTransaction();
      throw new Error(`Commit failed: ${error.message}`);
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.transactionActive) {
      return;
    }

    try {
      // Reset any staged files
      if (this.transactionFiles.length > 0) {
        await this.git.reset(['HEAD', ...this.transactionFiles]);
      }
    } catch (error: any) {
      console.warn('Warning: Could not fully rollback transaction:', error.message);
    } finally {
      this.transactionActive = false;
      this.transactionFiles = [];
    }
  }

  addToTransaction(filePath: string): void {
    if (!this.transactionActive) {
      throw new Error('No transaction active');
    }
    
    if (!this.transactionFiles.includes(filePath)) {
      this.transactionFiles.push(filePath);
    }
  }

  async getStatus(): Promise<StatusResult> {
    return await this.git.status();
  }

  async getDiff(options: {
    nameOnly?: boolean;
    cached?: boolean;
    pathFilter?: string[];
  } = {}): Promise<string> {
    const diffOptions: string[] = [];
    
    if (options.nameOnly) {
      diffOptions.push('--name-only');
    }
    
    if (options.cached) {
      diffOptions.push('--cached');
    }
    
    if (options.pathFilter && options.pathFilter.length > 0) {
      diffOptions.push('--', ...options.pathFilter);
    }

    return await this.git.diff(diffOptions);
  }

  async getCommitHistory(options: {
    maxCount?: number;
    since?: string;
    pathFilter?: string[];
  } = {}): Promise<any> {
    const logOptions: any = {};
    
    if (options.maxCount) {
      logOptions.maxCount = options.maxCount;
    }
    
    if (options.since) {
      logOptions.since = options.since;
    }

    if (options.pathFilter && options.pathFilter.length > 0) {
      return await this.git.log();
    }

    return await this.git.log();
  }

  async createBranch(branchName: string, baseBranch?: string): Promise<void> {
    if (baseBranch) {
      await this.git.checkoutBranch(branchName, baseBranch);
    } else {
      await this.git.checkoutLocalBranch(branchName);
    }
  }

  async switchBranch(branchName: string): Promise<void> {
    await this.git.checkout(branchName);
  }

  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'unknown';
  }

  async listBranches(): Promise<string[]> {
    const branches = await this.git.branchLocal();
    return branches.all;
  }

  async mergeBranch(branchName: string, options: {
    noFastForward?: boolean;
    message?: string;
  } = {}): Promise<void> {
    const mergeOptions: string[] = [];
    
    if (options.noFastForward) {
      mergeOptions.push('--no-ff');
    }
    
    if (options.message) {
      mergeOptions.push('-m', options.message);
    }

    await this.git.merge([branchName, ...mergeOptions]);
  }

  async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    const deleteOption = force ? '-D' : '-d';
    await this.git.branch([deleteOption, branchName]);
  }

  async push(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.push(remote, branch);
    } else {
      await this.git.push();
    }
  }

  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.git.pull();
    }
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.git.addRemote(name, url);
  }

  async getRemotes(): Promise<Array<{name: string, refs: {fetch: string, push: string}}>> {
    return await this.git.getRemotes(true);
  }

  async stash(message?: string): Promise<void> {
    if (message) {
      await this.git.stash(['push', '-m', message]);
    } else {
      await this.git.stash();
    }
  }

  async stashPop(): Promise<void> {
    await this.git.stash(['pop']);
  }

  async listStashes(): Promise<any> {
    return await this.git.stashList();
  }

  // Utility method for quick commits (non-transactional)
  async quickCommit(
    files: string[], 
    message: string, 
    body?: string
  ): Promise<string> {
    try {
      await this.git.add(files);
      
      const commitMessage = body ? `${message}\n\n${body}` : message;
      const result = await this.git.commit(commitMessage);
      
      return result.commit;
    } catch (error: any) {
      throw new Error(`Quick commit failed: ${error.message}`);
    }
  }

  // Repository statistics
  async getRepositoryStats(): Promise<{
    totalCommits: number;
    totalBranches: number;
    lastCommitDate: Date;
    repositorySize: string;
  }> {
    try {
      const log = await this.git.log();
      const branches = await this.git.branchLocal();
      
      const stats = {
        totalCommits: log.total,
        totalBranches: branches.all.length,
        lastCommitDate: log.latest ? new Date(log.latest.date) : new Date(),
        repositorySize: 'Unknown' // Would require additional system calls
      };

      return stats;
    } catch (error: any) {
      throw new Error(`Failed to get repository stats: ${error.message}`);
    }
  }

  // Check if working directory is clean
  async isWorkingDirectoryClean(): Promise<boolean> {
    const status = await this.git.status();
    return status.files.length === 0;
  }

  // Get modified files
  async getModifiedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return status.files.map(file => file.path);
  }
}