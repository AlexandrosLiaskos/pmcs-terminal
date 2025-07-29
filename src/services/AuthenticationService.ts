import * as fs from 'fs-extra';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import { AuthSession, User, CorporateContext, CorporateLevel, Classification } from '../types';

export class AuthenticationService {
  private readonly sessionFile = '.pmcs/session.json';
  private readonly usersFile = '.pmcs/users.json';
  private readonly jwtSecret = process.env.JWT_SECRET || 'pmcs-default-secret-key';
  private currentSession: AuthSession | null = null;

  constructor() {
    this.initializeAuthSystem();
  }

  private async initializeAuthSystem(): Promise<void> {
    await fs.ensureDir('.pmcs');
    
    // Create default users file if it doesn't exist
    if (!await fs.pathExists(this.usersFile)) {
      const defaultUsers = [
        {
          id: 'admin-001',
          email: 'admin@pmcs.local',
          name: 'System Administrator',
          password: await bcrypt.hash('admin123', 10),
          corporateLevel: CorporateLevel.CEO,
          role: 'Administrator',
          permissions: [
            'CREATE_ORGANIZATION',
            'CREATE_ASSIGNMENT',
            'CREATE_ANNOUNCEMENT',
            'MANAGE_USERS',
            'SYSTEM_ADMIN'
          ]
        },
        {
          id: 'user-001',
          email: 'user@pmcs.local',
          name: 'Default User',
          password: await bcrypt.hash('user123', 10),
          corporateLevel: CorporateLevel.MANAGER,
          role: 'Project Manager',
          permissions: [
            'CREATE_ASSIGNMENT',
            'CREATE_ANNOUNCEMENT'
          ]
        }
      ];
      
      await fs.writeJSON(this.usersFile, { users: defaultUsers }, { spaces: 2 });
    }
  }

  async authenticate(credentials: {
    email: string;
    password: string;
  }): Promise<AuthSession> {
    try {
      const userData = await fs.readJSON(this.usersFile);
      const user = userData.users.find((u: any) => u.email === credentials.email);
      
      if (!user) {
        throw new Error('Invalid email or password');
      }

      const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Create JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          corporateLevel: user.corporateLevel 
        },
        this.jwtSecret,
        { expiresIn: '24h' }
      );

      // Create session
      const session: AuthSession = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          corporateLevel: user.corporateLevel,
          role: user.role,
          permissions: user.permissions
        },
        permissions: {
          canCreateOrganization: user.permissions.includes('CREATE_ORGANIZATION'),
          canCreateAssignment: user.permissions.includes('CREATE_ASSIGNMENT'),
          canCreateAnnouncement: user.permissions.includes('CREATE_ANNOUNCEMENT'),
          canManageAnnouncements: user.permissions.includes('MANAGE_ANNOUNCEMENTS')
        },
        corporateContext: {
          role: user.role,
          level: user.corporateLevel,
          approvals: [], // Would be populated based on hierarchy
          classification: Classification.UNCLASSIFIED
        },
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };

      // Save session to file
      await fs.writeJSON(this.sessionFile, session, { spaces: 2 });
      this.currentSession = session;

      return session;
    } catch (error: any) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async getCurrentSession(): Promise<AuthSession> {
    if (this.currentSession) {
      // Check if session is still valid
      if (new Date() < new Date(this.currentSession.expiresAt)) {
        return this.currentSession;
      }
    }

    // Try to load session from file
    if (await fs.pathExists(this.sessionFile)) {
      try {
        const session = await fs.readJSON(this.sessionFile);
        
        // Validate token
        const decoded = jwt.verify(session.token, this.jwtSecret);
        
        // Check expiration
        if (new Date() < new Date(session.expiresAt)) {
          this.currentSession = session;
          return session;
        }
      } catch (error: any) {
        // Invalid or expired session
        await this.clearSession();
      }
    }

    throw new Error('No valid session found. Please login first.');
  }

  async validateSession(token: string): Promise<boolean> {
    try {
      jwt.verify(token, this.jwtSecret);
      return true;
    } catch (error: any) {
      return false;
    }
  }

  async logout(): Promise<void> {
    await this.clearSession();
  }

  private async clearSession(): Promise<void> {
    this.currentSession = null;
    if (await fs.pathExists(this.sessionFile)) {
      await fs.remove(this.sessionFile);
    }
  }

  async canAccessEntity(
    entityType: string, 
    entityId: string, 
    userId: string
  ): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      
      // System admin can access everything
      if (session.user.permissions.includes('SYSTEM_ADMIN')) {
        return true;
      }

      // For now, allow access based on corporate level
      // In a real implementation, this would check entity-specific permissions
      const accessLevels = [
        CorporateLevel.CEO,
        CorporateLevel.COO,
        CorporateLevel.CTO,
        CorporateLevel.CFO,
        CorporateLevel.EVP,
        CorporateLevel.SVP,
        CorporateLevel.VP,
        CorporateLevel.DIRECTOR,
        CorporateLevel.MANAGER
      ];

      return accessLevels.includes(session.user.corporateLevel);
    } catch (error: any) {
      return false;
    }
  }

  async canCreateOrganization(userId: string): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      return session.permissions.canCreateOrganization;
    } catch (error: any) {
      return false;
    }
  }

  async canCreateAssignment(
    entityType: string, 
    entityId: string, 
    userId: string
  ): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      return session.permissions.canCreateAssignment;
    } catch (error: any) {
      return false;
    }
  }

  async canCreateAnnouncement(
    entityType: string, 
    entityId: string, 
    userId: string
  ): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      return session.permissions.canCreateAnnouncement;
    } catch (error: any) {
      return false;
    }
  }

  async getSessionStatus(): Promise<{
    authenticated: boolean;
    user?: User;
    expiresAt?: Date;
  }> {
    try {
      const session = await this.getCurrentSession();
      return {
        authenticated: true,
        user: session.user,
        expiresAt: session.expiresAt
      };
    } catch (error: any) {
      return {
        authenticated: false
      };
    }
  }

  // Helper method to create new users (for admin purposes)
  async createUser(userData: {
    email: string;
    name: string;
    password: string;
    corporateLevel: CorporateLevel;
    role: string;
    permissions: string[];
  }): Promise<User> {
    const users = await fs.readJSON(this.usersFile);
    
    // Check if user already exists
    if (users.users.find((u: any) => u.email === userData.email)) {
      throw new Error('User with this email already exists');
    }

    const newUser = {
      id: `user-${Date.now()}`,
      email: userData.email,
      name: userData.name,
      password: await bcrypt.hash(userData.password, 10),
      corporateLevel: userData.corporateLevel,
      role: userData.role,
      permissions: userData.permissions
    };

    users.users.push(newUser);
    await fs.writeJSON(this.usersFile, users, { spaces: 2 });

    // Return user without password
    const { password, ...userWithoutPassword } = newUser;
    return userWithoutPassword as User;
  }
}