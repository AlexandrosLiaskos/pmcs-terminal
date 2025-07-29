# PMCS Terminal Application

**Enterprise Project Management Command-Line System**

A headless, file-based project management system designed for terminal-driven workflows with git-based collaboration, corporate hierarchy integration, and automatic military-grade encryption.

## 🚀 Features

- **Headless Terminal Interface** - Complete CLI-based project management
- **Automatic Encryption** - All data automatically encrypted with AES-256-GCM by default
- **File-Based Storage** - No database required, all data stored in encrypted JSON files
- **Git Integration** - Version control for all operations with atomic transactions
- **Corporate Hierarchy** - Built-in support for enterprise organizational structures
- **Role-Based Access Control** - Comprehensive permission system
- **Classification Levels** - Security classifications (TOP SECRET, SECRET, CONFIDENTIAL, UNCLASSIFIED)
- **OKR Framework** - Objectives and Key Results management
- **Assignment System** - Task assignment with approval workflows
- **Announcement Management** - Team communication and notifications

## 📦 Installation

### Prerequisites

- Node.js 18.0.0 or higher
- Git
- TypeScript (for development)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/AlexandrosLiaskos/pmcs-terminal.git
cd pmcs-terminal

# Install dependencies
npm install

# Build the application
npm run build

# Make pmcs available globally (one-time setup)
sudo npm link

# Now you can use 'pmcs' anywhere!
# Go to any folder where you want a project management system
cd ~/my-projects
pmcs init

# Register first user (becomes system owner)
pmcs auth register -n "System Owner" -e "admin@company.com" -p "securepass123"

# Login
pmcs auth login -e "admin@company.com" -p "securepass123"

# Create your first organization (automatically encrypted)
pmcs organization create -n "My Organization"
```

### Development Mode

```bash
# Run in development mode
npm run dev -- <command>

# Example: Register first user in development
npm run dev -- auth register -n "Dev User" -e "dev@company.com" -p "devpass123"

# Example: Login in development
npm run dev -- auth login -e "dev@company.com" -p "devpass123"
```

## 🏗️ Architecture

### Directory Structure

```
terminal/
├── src/
│   ├── cli.ts                 # Main CLI entry point
│   ├── commands/              # Command implementations
│   │   ├── AuthCommands.ts
│   │   ├── OrganizationCommands.ts
│   │   ├── AssignmentCommands.ts
│   │   └── AnnouncementCommands.ts
│   ├── services/              # Core services
│   │   ├── AuthenticationService.ts
│   │   ├── GitService.ts
│   │   ├── CryptoService.ts    # Automatic encryption service
│   │   ├── EncryptedFileRepository.ts
│   │   └── RepositoryFactory.ts
│   ├── types/                 # Type definitions
│   │   └── index.ts
│   └── utils/                 # Utilities
│       └── HelpSystem.ts
├── docs/                      # Documentation
├── dist/                      # Compiled JavaScript
└── package.json
```

### Data Storage

All data is automatically encrypted and stored in a hierarchical file structure:

```
organizations/
├── <org-id>/
│   ├── organization.json.encrypted    # Encrypted organization metadata
│   ├── portfolios/                    # Encrypted portfolio entities
│   ├── programs/                      # Encrypted program entities
│   ├── projects/                      # Encrypted project entities
│   ├── assignments/                   # Encrypted task assignments
│   ├── announcements/                 # Encrypted communications
│   └── README.md                      # Plain text documentation
.pmcs/
├── encryption/                        # Encryption keys and metadata
│   ├── master.key                     # Master encryption key
│   └── access.log                     # Decryption access logs
└── config.json                        # System configuration
```

## 🎯 Quick Commands

### Authentication
```bash
pmcs auth login                # Interactive login
pmcs auth login -e <email> -p <password>  # Direct login
pmcs auth status               # Check session status
pmcs auth logout               # Logout
```

### Organizations
```bash
pmcs organization create -n "Org Name" -d "Description"
pmcs organization list         # List all organizations
pmcs organization show <id>    # Show organization details
```

### Assignments
```bash
pmcs assignments create -t "Task Title" --entity project/abc123 --assignee user@email.com
pmcs assignments list --assigned-to-me     # My assignments
pmcs assignments list --assigned-by-me     # Assignments I created
pmcs assignments show <id>                 # Assignment details
```

### Announcements
```bash
pmcs announcements create -t "Title" -c "Content" --entity organization/abc123
pmcs announcements list --unread           # Unread announcements
pmcs announcements show <id>               # Announcement details
```

### Organization Membership
```bash
# Add member to organization (requires management permissions)
pmcs members add -o <org-id> -u user@email.com -l MANAGER

# List organization members
pmcs members list -o <org-id>

# Update member role
pmcs members update-role -o <org-id> -u user@email.com -l DIRECTOR

# Remove member
pmcs members remove -o <org-id> -u user@email.com
```

## 🔐 Security & Encryption

### Automatic Encryption
All data is automatically encrypted using **AES-256-GCM** encryption:
- **Transparent Operation** - No encryption commands needed, all files encrypted by default
- **Hierarchical Keys** - Master key derives organization and user-specific keys
- **Classification-Based** - Encryption strength varies by security classification
- **Audit Trail** - All decryption operations logged for security compliance

### Key Management
- **Master Key** - Generated automatically during `pmcs init`
- **Derived Keys** - User/organization specific keys derived from master key
- **Session Keys** - Temporary keys for active user sessions
- **Key Rotation** - Automatic key rotation based on security policies

## 🔐 Permissions & Access Control

### Corporate Hierarchy Levels
- **CEO** - Chief Executive Officer
- **COO** - Chief Operating Officer  
- **CTO** - Chief Technology Officer
- **CFO** - Chief Financial Officer
- **EVP** - Executive Vice President
- **SVP** - Senior Vice President
- **VP** - Vice President
- **DIRECTOR** - Director
- **MANAGER** - Manager
- **SENIOR_MEMBER** - Senior Team Member
- **MEMBER** - Team Member
- **OBSERVER** - Observer (read-only)

### Classification Levels
- **TOP_SECRET** - Highest security level
- **SECRET** - High security level
- **CONFIDENTIAL** - Moderate security level
- **UNCLASSIFIED** - Standard access level

### New System Setup

**First User Registration (System Owner)**
The first user to register automatically becomes the `system.owner` with full control:

```bash
# First registration creates system owner
pmcs auth register -n "System Owner" -e "owner@company.com" -p "securepass123"

# Subsequent registrations require system owner/admin login
pmcs auth login -e "owner@company.com" -p "securepass123"
pmcs auth register -n "Team Lead" -e "lead@company.com" -p "pass123" -s "system.admin"
```

**System Roles**
- `system.owner` - First user only, full system control
- `system.admin` - Can register users, create organizations  
- `system.member` - Basic system access only

**Organization Membership**
Users must be added to organizations with corporate roles:
- System roles control system-wide actions
- Corporate roles control organization-specific actions

## 🛠️ Development

### Scripts
```bash
npm run build        # Compile TypeScript
npm run dev          # Run in development mode
npm run start        # Run compiled version
npm run test         # Run tests
npm run type-check   # TypeScript type checking
npm run lint         # Code linting
npm run clean        # Clean build directory
```

### Adding New Commands

1. Create command class in `src/commands/`
2. Implement command methods (create, list, show, etc.)
3. Register command in `src/cli.ts`
4. Add help documentation in `src/utils/HelpSystem.ts`
5. Update types in `src/types/index.ts` if needed

### Git Workflow

The system uses git transactions for atomic operations:

```typescript
// Start a transaction
await gitService.startTransaction();

try {
  // Perform file operations
  await repository.create(entityData);
  
  // Commit transaction
  await gitService.commitTransaction("feat: Add new entity");
} catch (error) {
  // Rollback on error
  await gitService.rollbackTransaction();
  throw error;
}
```

## 📊 Entity Hierarchy

```
Organization
├── Portfolio (Strategic grouping)
│   └── Program (Operational grouping)
│       └── Project (Individual project)
│           └── Objective (OKR Objective)
│               └── Key Result (Measurable result)
│                   └── Initiative (Action item)
```

## 🔄 Workflows

### Creating an Organization
```bash
# 1. Authenticate
pmcs auth login

# 2. Create organization
pmcs organization create -n "Strategic Initiatives" -c SECRET

# 3. Verify creation
pmcs organization list
```

### Assignment Workflow
```bash
# 1. Create assignment in organization
pmcs assignments create \
  -t "Review quarterly budget" \
  --entity organization/abc123 \
  --assignee john.doe@company.com \
  --priority HIGH \
  --due-date 2024-12-31

# 2. Check assignment status
pmcs assignments show <assignment-id>

# 3. List my assignments
pmcs assignments list --assigned-to-me
```

## 🐛 Troubleshooting

### Common Issues

**Authentication Failed**
```bash
# Check credentials
pmcs auth status

# Register first user if system is empty
pmcs auth register -n "System Owner" -e "admin@company.com" -p "securepass123"

# Login with your credentials
pmcs auth login -e "admin@company.com" -p "securepass123"
```

**Git Repository Issues**
```bash
# Reinitialize if needed
rm -rf .git
pmcs init
```

**Permission Denied**
- Ensure you're logged in with appropriate permissions
- Check corporate hierarchy levels match requirements
- Verify classification levels for sensitive operations

### Logs and Debugging

Enable verbose logging:
```bash
pmcs --verbose <command>
```

Check git status:
```bash
git status
git log --oneline -10
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Code Style
- TypeScript with strict mode
- ESLint for code linting
- Consistent error handling with typed catches
- Follow existing patterns for commands and services

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the documentation in `/docs/`
- Review help system: `pmcs help <command>`
- Create an issue in the repository

---

**PMCS Terminal Application** - Enterprise project management for the command line.