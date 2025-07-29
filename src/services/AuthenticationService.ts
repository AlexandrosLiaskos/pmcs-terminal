import * as fs from 'fs-extra';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import { 
  AuthSession, 
  User, 
  SystemRole, 
  SystemPermissions,
  OrganizationMembership,
  OrganizationPermissions,
  LoginCredentials,
  RegistrationData,
  CorporateLevel,
  Classification 
} from '../types';

export class AuthenticationService {
  private readonly sessionFile = '.pmcs/session.json';
  private readonly usersFile = '.pmcs/users.json';
  private readonly membershipsFile = '.pmcs/memberships.json';
  private readonly jwtSecret = process.env.JWT_SECRET || 'pmcs-default-secret-key';
  private currentSession: AuthSession | null = null;

  constructor() {
    this.initializeAuthSystem();
  }

  private async initializeAuthSystem(): Promise<void> {
    await fs.ensureDir('.pmcs');
    
    // Create empty users file if it doesn't exist (no default users)
    if (!await fs.pathExists(this.usersFile)) {
      await fs.writeJSON(this.usersFile, { users: [] }, { spaces: 2 });
    }

    // Create empty memberships file if it doesn't exist
    if (!await fs.pathExists(this.membershipsFile)) {
      await fs.writeJSON(this.membershipsFile, { memberships: [] }, { spaces: 2 });
    }
  }

  /**
   * Check if this is the first user registration (system is empty)
   */
  async isFirstUser(): Promise<boolean> {
    const userData = await fs.readJSON(this.usersFile);
    return userData.users.length === 0;
  }

  /**
   * Get system permissions based on system role
   */
  private getSystemPermissions(systemRole: SystemRole): SystemPermissions {
    switch (systemRole) {
      case SystemRole.SYSTEM_OWNER:
        return {
          canRegisterUsers: true,
          canCreateOrganizations: true,
          canManageSystem: true,
          canDeleteOrganizations: true
        };
      case SystemRole.SYSTEM_ADMIN:
        return {
          canRegisterUsers: true,
          canCreateOrganizations: true,
          canManageSystem: false,
          canDeleteOrganizations: false
        };
      case SystemRole.SYSTEM_MEMBER:
      default:
        return {
          canRegisterUsers: false,
          canCreateOrganizations: false,
          canManageSystem: false,
          canDeleteOrganizations: false
        };
    }
  }

  /**
   * Get organization permissions based on corporate level within org
   */
  private getOrganizationPermissions(
    organizationId: string, 
    corporateLevel: CorporateLevel
  ): OrganizationPermissions {
    const executiveLevels = [CorporateLevel.CEO, CorporateLevel.COO, CorporateLevel.CTO, CorporateLevel.CFO];
    const seniorLevels = [CorporateLevel.EVP, CorporateLevel.SVP, CorporateLevel.VP];
    const managementLevels = [CorporateLevel.DIRECTOR, CorporateLevel.MANAGER];
    
    return {
      organizationId,
      corporateLevel,
      canManageMembers: executiveLevels.includes(corporateLevel),
      canCreateAssignments: [...executiveLevels, ...seniorLevels, ...managementLevels].includes(corporateLevel),
      canCreateAnnouncements: [...executiveLevels, ...seniorLevels, ...managementLevels].includes(corporateLevel),
      canManageEntities: [...executiveLevels, ...seniorLevels].includes(corporateLevel),
      canViewClassified: executiveLevels.includes(corporateLevel),
      visibilityLevel: corporateLevel
    };
  }

  async authenticate(credentials: LoginCredentials): Promise<AuthSession> {
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

      // Get user's organization memberships
      const membershipsData = await fs.readJSON(this.membershipsFile);
      const userMemberships = membershipsData.memberships.filter(
        (m: OrganizationMembership) => m.userId === user.id && m.status === 'ACTIVE'
      );

      // Generate organization permissions for each membership
      const organizationPermissions = userMemberships.map((membership: OrganizationMembership) =>
        this.getOrganizationPermissions(membership.organizationId, membership.corporateLevel)
      );

      // Create JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          systemRole: user.systemRole 
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
          systemRole: user.systemRole,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        systemPermissions: this.getSystemPermissions(user.systemRole),
        organizationMemberships: userMemberships,
        organizationPermissions,
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
      
      if (session.user.id !== userId) {
        return false;
      }
      
      // System owner can access everything
      if (session.user.systemRole === SystemRole.SYSTEM_OWNER) {
        return true;
      }

      // For entity access, need to determine which organization it belongs to
      // and check if user has appropriate permissions in that organization
      // This would typically require looking up the entity's organization
      // For now, return true if user has any organization memberships
      return session.organizationMemberships.length > 0;
    } catch (error: any) {
      return false;
    }
  }

  async canCreateOrganization(userId: string): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      return session.user.id === userId && session.systemPermissions.canCreateOrganizations;
    } catch (error: any) {
      return false;
    }
  }

  async canCreateAssignment(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      if (session.user.id !== userId) {
        return false;
      }

      const orgPermissions = session.organizationPermissions.find(
        p => p.organizationId === organizationId
      );

      return orgPermissions?.canCreateAssignments || false;
    } catch (error: any) {
      return false;
    }
  }

  async canCreateAnnouncement(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      if (session.user.id !== userId) {
        return false;
      }

      const orgPermissions = session.organizationPermissions.find(
        p => p.organizationId === organizationId
      );

      return orgPermissions?.canCreateAnnouncements || false;
    } catch (error: any) {
      return false;
    }
  }

  async getSessionStatus(): Promise<{
    authenticated: boolean;
    user?: User;
    systemRole?: SystemRole;
    systemPermissions?: SystemPermissions;
    organizationCount?: number;
    expiresAt?: Date;
  }> {
    try {
      const session = await this.getCurrentSession();
      return {
        authenticated: true,
        user: session.user,
        systemRole: session.user.systemRole,
        systemPermissions: session.systemPermissions,
        organizationCount: session.organizationMemberships.length,
        expiresAt: session.expiresAt
      };
    } catch (error: any) {
      return {
        authenticated: false
      };
    }
  }

  /**
   * Register a new user with proper security checks
   */
  async register(userData: RegistrationData): Promise<User> {
    const isFirst = await this.isFirstUser();
    
    // If not first user, verify current user has permission to register
    if (!isFirst) {
      try {
        const session = await this.getCurrentSession();
        if (!session.systemPermissions.canRegisterUsers) {
          throw new Error('Insufficient permissions to register users. Only system owners and admins can register new users.');
        }
      } catch (error: any) {
        throw new Error('You must be logged in with appropriate permissions to register new users.');
      }
    }

    // Determine system role
    let systemRole: SystemRole;
    if (isFirst) {
      // First user becomes system owner
      systemRole = SystemRole.SYSTEM_OWNER;
    } else {
      // Use provided role or default to member
      systemRole = userData.systemRole || SystemRole.SYSTEM_MEMBER;
    }

    return await this.createUser({
      email: userData.email,
      name: userData.name,
      password: userData.password,
      systemRole
    });
  }

  /**
   * Create user with system role (internal method)
   */
  private async createUser(userData: {
    email: string;
    name: string;
    password: string;
    systemRole: SystemRole;
  }): Promise<User> {
    const users = await fs.readJSON(this.usersFile);
    
    // Check if user already exists
    if (users.users.find((u: any) => u.email === userData.email)) {
      throw new Error('User with this email already exists');
    }

    const now = new Date();
    const newUser = {
      id: `user-${Date.now()}`,
      email: userData.email,
      name: userData.name,
      password: await bcrypt.hash(userData.password, 10),
      systemRole: userData.systemRole,
      createdAt: now,
      updatedAt: now
    };

    users.users.push(newUser);
    await fs.writeJSON(this.usersFile, users, { spaces: 2 });

    // Return user without password
    const { password, ...userWithoutPassword } = newUser;
    return userWithoutPassword as User;
  }

  /**
   * Add user to organization with corporate role
   */
  async addUserToOrganization(
    userId: string, 
    organizationId: string, 
    corporateLevel: CorporateLevel,
    invitedBy: string
  ): Promise<OrganizationMembership> {
    const membershipsData = await fs.readJSON(this.membershipsFile);
    
    // Check if membership already exists
    const existingMembership = membershipsData.memberships.find(
      (m: OrganizationMembership) => 
        m.userId === userId && m.organizationId === organizationId
    );
    
    if (existingMembership) {
      throw new Error('User is already a member of this organization');
    }

    const newMembership: OrganizationMembership = {
      id: `membership-${Date.now()}`,
      userId,
      organizationId,
      corporateLevel,
      joinedAt: new Date(),
      invitedBy,
      status: 'ACTIVE'
    };

    membershipsData.memberships.push(newMembership);
    await fs.writeJSON(this.membershipsFile, membershipsData, { spaces: 2 });

    return newMembership;
  }

  /**
   * Check if user can perform action in organization based on corporate role
   */
  async canPerformActionInOrganization(
    userId: string,
    organizationId: string,
    action: 'manage_members' | 'create_assignments' | 'create_announcements' | 'manage_entities' | 'view_classified'
  ): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      if (session.user.id !== userId) {
        return false;
      }

      const orgPermissions = session.organizationPermissions.find(
        p => p.organizationId === organizationId
      );

      if (!orgPermissions) {
        return false;
      }

      switch (action) {
        case 'manage_members':
          return orgPermissions.canManageMembers;
        case 'create_assignments':
          return orgPermissions.canCreateAssignments;
        case 'create_announcements':
          return orgPermissions.canCreateAnnouncements;
        case 'manage_entities':
          return orgPermissions.canManageEntities;
        case 'view_classified':
          return orgPermissions.canViewClassified;
        default:
          return false;
      }
    } catch (error: any) {
      return false;
    }
  }
}