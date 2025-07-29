# PMCS Terminal - Installation Guide

Complete installation and setup guide for the PMCS Terminal Application.

## System Requirements

### Minimum Requirements
- **Node.js**: 18.0.0 or higher
- **Git**: 2.0 or higher
- **Operating System**: Linux, macOS, or Windows (with WSL recommended)
- **Memory**: 512MB RAM
- **Storage**: 100MB for application + data storage needs

### Recommended Requirements
- **Node.js**: 20.0.0 or higher
- **Git**: 2.30 or higher
- **Memory**: 1GB RAM
- **Storage**: 1GB available space

## Installation Methods

### Method 1: From Source (Recommended)

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd terminal
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Application**
   ```bash
   npm run build
   ```

4. **Create Global Command (Optional)**
   ```bash
   npm link
   # Now you can use 'pmcs' globally
   ```

5. **Initialize PMCS**
   ```bash
   npm start -- init
   # Or if you used npm link:
   pmcs init
   ```

### Method 2: Pre-built Binary (If Available)

1. **Download Binary**
   ```bash
   # Download appropriate binary for your platform
   wget <binary-url>
   chmod +x pmcs
   ```

2. **Move to PATH**
   ```bash
   sudo mv pmcs /usr/local/bin/
   ```

3. **Initialize PMCS**
   ```bash
   pmcs init
   ```

### Method 3: Development Installation

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd terminal
   npm install
   ```

2. **Development Mode**
   ```bash
   # Run commands in development mode
   npm run dev -- init
   npm run dev -- auth login
   ```

## Post-Installation Setup

### 1. Directory Structure Verification

After running `pmcs init`, verify the following structure was created:

```
your-project/
├── .git/                     # Git repository
├── .pmcs/                    # PMCS configuration
│   ├── config.json          # Application config
│   ├── users.json           # User accounts
│   └── session.json         # Current session (created on login)
├── organizations/           # Organization data
├── assignments/             # Assignment data  
├── announcements/          # Announcement data
└── .gitignore              # Git ignore rules
```

### 2. First Login

Use the default administrator account:

```bash
pmcs auth login -e admin@pmcs.local -p admin123
```

Expected output:
```
✅ Authentication successful!
Welcome, System Administrator
Role: Administrator
Corporate Level: CEO
Session expires: [timestamp]
```

### 3. Verify Installation

Test basic functionality:

```bash
# Check authentication status
pmcs auth status

# Create test organization
pmcs organization create -n "Test Organization"

# List organizations
pmcs organization list

# Show help
pmcs help
```

## Configuration

### Application Configuration

Edit `.pmcs/config.json` to customize settings:

```json
{
  "application": {
    "name": "PMCS Terminal",
    "version": "1.0.0",
    "sessionTimeout": 28800,
    "defaultClassification": "UNCLASSIFIED"
  },
  "git": {
    "autoCommit": true,
    "requireSignedCommits": false,
    "defaultBranch": "main"
  },
  "corporate": {
    "enforceHierarchy": true,
    "requireApprovals": false,
    "defaultAccessLevel": "MEMBER"
  }
}
```

### User Management

Add users by editing `.pmcs/users.json`:

```json
{
  "users": [
    {
      "id": "admin-user",
      "email": "admin@pmcs.local",
      "name": "System Administrator",
      "password": "$2b$10$...", 
      "corporateLevel": "CEO",
      "role": "Administrator",
      "permissions": [
        "CREATE_ORGANIZATION",
        "CREATE_ASSIGNMENT", 
        "CREATE_ANNOUNCEMENT",
        "MANAGE_ANNOUNCEMENTS"
      ]
    },
    {
      "id": "new-user",
      "email": "john.doe@company.com",
      "name": "John Doe",
      "password": "$2b$10$...",
      "corporateLevel": "MANAGER",
      "role": "Project Manager", 
      "permissions": [
        "CREATE_ASSIGNMENT",
        "CREATE_ANNOUNCEMENT"
      ]
    }
  ]
}
```

### Environment Variables

Create `.env` file for sensitive configuration:

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRATION=8h

# Default Admin Credentials (for automated setups)
DEFAULT_ADMIN_EMAIL=admin@yourcompany.com
DEFAULT_ADMIN_PASSWORD=secure-admin-password

# Git Configuration
GIT_USER_NAME=PMCS System
GIT_USER_EMAIL=pmcs@yourcompany.com

# Corporate Settings
ENFORCE_HIERARCHY=true
DEFAULT_CLASSIFICATION=CONFIDENTIAL
```

## Platform-Specific Setup

### Linux/macOS

1. **Set Execute Permissions**
   ```bash
   chmod +x node_modules/.bin/pmcs
   ```

2. **Shell Completion (Optional)**
   ```bash
   # For bash
   pmcs --completion >> ~/.bashrc

   # For zsh  
   pmcs --completion >> ~/.zshrc
   ```

3. **Systemd Service (Optional)**
   Create `/etc/systemd/system/pmcs.service`:
   ```ini
   [Unit]
   Description=PMCS Terminal Application
   After=network.target

   [Service]
   Type=simple
   User=pmcs
   WorkingDirectory=/opt/pmcs
   ExecStart=/usr/bin/node dist/cli.js daemon
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

### Windows

1. **Windows Subsystem for Linux (Recommended)**
   ```powershell
   # Install WSL
   wsl --install

   # Follow Linux installation steps inside WSL
   ```

2. **Native Windows (PowerShell)**
   ```powershell
   # Ensure Node.js and Git are installed
   node --version
   git --version

   # Clone and install
   git clone <repository-url>
   cd terminal
   npm install
   npm run build

   # Run commands
   npm start -- init
   ```

3. **Windows Batch Script (Optional)**
   Create `pmcs.bat`:
   ```batch
   @echo off
   node "C:\path\to\pmcs\dist\cli.js" %*
   ```

### Docker Installation

1. **Create Dockerfile**
   ```dockerfile
   FROM node:18-alpine

   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production

   COPY . .
   RUN npm run build

   RUN adduser -D pmcs
   USER pmcs

   VOLUME ["/app/data"]
   EXPOSE 3000

   CMD ["node", "dist/cli.js", "daemon"]
   ```

2. **Build and Run**
   ```bash
   docker build -t pmcs-terminal .
   docker run -v $(pwd)/data:/app/data -p 3000:3000 pmcs-terminal
   ```

## Network/Enterprise Setup

### Corporate Network Configuration

1. **Proxy Setup**
   ```bash
   # Set npm proxy
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080

   # Set git proxy
   git config --global http.proxy http://proxy.company.com:8080
   ```

2. **Certificate Management**
   ```bash
   # Add corporate certificates
   export NODE_EXTRA_CA_CERTS=/path/to/corporate-certs.pem
   ```

### Multi-User Setup

1. **Shared Installation**
   ```bash
   # Install in shared location
   sudo mkdir /opt/pmcs
   sudo chown pmcs:pmcs /opt/pmcs
   
   # Clone and install as pmcs user
   sudo -u pmcs git clone <repository-url> /opt/pmcs
   cd /opt/pmcs
   sudo -u pmcs npm install
   sudo -u pmcs npm run build
   ```

2. **User Workspace Setup**
   ```bash
   # Each user creates their own workspace
   mkdir ~/pmcs-workspace
   cd ~/pmcs-workspace
   /opt/pmcs/bin/pmcs init
   ```

## Troubleshooting Installation

### Common Issues

**Node.js Version Error**
```bash
# Check Node.js version
node --version

# Install/upgrade Node.js using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Permission Denied Errors**
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use npm prefix
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
```

**Git Not Initialized**
```bash
# If pmcs init fails
rm -rf .git
git init
git config user.name "PMCS System"
git config user.email "pmcs@company.com"
pmcs init
```

**TypeScript Compilation Errors**
```bash
# Clean and rebuild
npm run clean
npm run build

# If still failing, check Node.js version
node --version  # Should be 18+ 
```

**File Permission Issues**
```bash
# Fix file permissions
find . -type f -name "*.json" -exec chmod 644 {} \;
find . -type d -exec chmod 755 {} \;
```

### Diagnostic Commands

```bash
# System information
node --version
npm --version
git --version

# PMCS status
pmcs auth status
pmcs --version

# File system check
ls -la .pmcs/
cat .pmcs/config.json

# Git status
git status
git log --oneline -5
```

### Logging and Debugging

1. **Enable Verbose Logging**
   ```bash
   pmcs --verbose auth login
   ```

2. **Check Log Files**
   ```bash
   # Application logs (if configured)
   tail -f .pmcs/logs/application.log
   
   # Git logs
   git log --oneline -10
   ```

3. **Debug Mode**
   ```bash
   # Development mode with debugging
   DEBUG=pmcs:* npm run dev -- auth login
   ```

## Uninstallation

### Clean Uninstall

```bash
# Remove global link (if created)
npm unlink

# Remove application directory
cd ..
rm -rf terminal/

# Remove global npm packages (if any)
npm uninstall -g pmcs-terminal

# Clean npm cache
npm cache clean --force
```

### Data Preservation

If you want to keep your data but remove the application:

```bash
# Backup data
tar -czf pmcs-backup.tar.gz organizations/ assignments/ announcements/ .pmcs/

# Remove application
rm -rf node_modules/ dist/ src/

# Restore data when reinstalling
tar -xzf pmcs-backup.tar.gz
```

## Next Steps

After successful installation:

1. Read the [User Guide](USER_GUIDE.md)
2. Check the [API Reference](API_REFERENCE.md) for development
3. Create your first organization: `pmcs organization create -n "My Organization"`
4. Set up additional users in `.pmcs/users.json`
5. Configure corporate hierarchy and permissions as needed

---

*For additional support, consult the troubleshooting section or create an issue in the repository.*