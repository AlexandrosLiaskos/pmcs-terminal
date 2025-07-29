# PMCS Terminal - User Guide

Complete guide for using the PMCS Terminal Application for enterprise project management.

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Organizations](#organizations)
- [Assignments](#assignments)
- [Announcements](#announcements)
- [Corporate Hierarchy](#corporate-hierarchy)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Getting Started

### First Time Setup

1. **Initialize the application**
   ```bash
   pmcs init
   ```
   This creates the git repository and directory structure.

2. **Login with default credentials**
   ```bash
   pmcs auth login
   # Use: admin@pmcs.local / admin123
   ```

3. **Create your first organization**
   ```bash
   pmcs organization create -n "My Organization"
   ```

### Daily Workflow

```bash
# Start your day
pmcs auth status                    # Check login status
pmcs assignments list --assigned-to-me  # See your tasks
pmcs announcements list --unread    # Check updates

# Work with projects
pmcs organization list              # Find organizations
pmcs organization show <id>         # View details
```

## Authentication

### Login Methods

**Interactive Login**
```bash
pmcs auth login
# Prompts for email and password
```

**Direct Login**
```bash
pmcs auth login -e your.email@company.com -p yourpassword
```

**Check Status**
```bash
pmcs auth status
# Shows: user info, permissions, session expiry
```

**Logout**
```bash
pmcs auth logout
```

### Default Accounts

| Role | Email | Password | Level | Permissions |
|------|-------|----------|-------|-------------|
| Admin | admin@pmcs.local | admin123 | CEO | Full access |
| User | user@pmcs.local | user123 | MEMBER | Limited access |

## Organizations

Organizations are the top-level entities in PMCS. They contain all other project entities.

### Creating Organizations

**Basic Organization**
```bash
pmcs organization create -n "Strategic Initiatives"
```

**With Classification**
```bash
pmcs organization create \
  -n "Defense Projects" \
  -d "Military defense initiatives" \
  -c SECRET \
  --corporate-level VP
```

### Managing Organizations

**List All Organizations**
```bash
pmcs organization list
```

**View Organization Details**
```bash
pmcs organization show <organization-id>
```

**JSON Output**
```bash
pmcs organization list --format json
```

### Organization Structure

Each organization creates this directory structure:
```
organizations/<org-id>/
├── organization.json     # Metadata
├── portfolios/          # Strategic groupings
├── programs/            # Operational groupings  
├── projects/            # Individual projects
├── assignments/         # Task assignments
├── announcements/       # Communications
├── rif/                 # Requests, Issues, Feedback
└── README.md            # Documentation
```

## Assignments

Assignments are tasks that can be assigned to team members within any entity.

### Creating Assignments

**Basic Assignment**
```bash
pmcs assignments create \
  -t "Review Q4 Budget" \
  --entity organization/abc123 \
  --assignee john@company.com
```

**Assignment with Details**
```bash
pmcs assignments create \
  -t "Security Audit" \
  -d "Complete security audit of all systems" \
  --entity project/xyz789 \
  --assignee security@company.com \
  --priority HIGH \
  --due-date 2024-12-31
```

### Managing Assignments

**View Your Assignments**
```bash
pmcs assignments list --assigned-to-me
```

**View Assignments You Created**
```bash
pmcs assignments list --assigned-by-me
```

**Filter by Status**
```bash
pmcs assignments list --status IN_PROGRESS
```

**View Assignment Details**
```bash
pmcs assignments show <assignment-id>
```

### Assignment Status Flow

```
PENDING_APPROVAL → ASSIGNED → IN_PROGRESS → COMPLETED
                      ↓
                  CANCELLED
                      ↓
                   OVERDUE
```

## Announcements

Announcements are communications sent to teams within organizations or projects.

### Creating Announcements

**Basic Announcement**
```bash
pmcs announcements create \
  -t "Team Meeting" \
  -c "Weekly team meeting moved to Friday at 2 PM" \
  --entity organization/abc123
```

**Urgent Announcement**
```bash
pmcs announcements create \
  -t "System Maintenance" \
  -c "Scheduled maintenance tonight from 10 PM to 2 AM" \
  --entity organization/abc123 \
  --type URGENT \
  --priority HIGH \
  --publish-now
```

### Managing Announcements

**View All Announcements**
```bash
pmcs announcements list
```

**View Unread Announcements**
```bash
pmcs announcements list --unread
```

**View Announcement Details**
```bash
pmcs announcements show <announcement-id>
```

### Announcement Types

- **GENERAL** - Standard communications
- **URGENT** - Time-sensitive information
- **POLICY** - Policy changes and updates
- **SYSTEM** - System-related notifications
- **MAINTENANCE** - Maintenance schedules

## Corporate Hierarchy

PMCS enforces corporate hierarchy for access control and approval workflows.

### Hierarchy Levels (High to Low)

1. **CEO** - Chief Executive Officer
2. **COO** - Chief Operating Officer
3. **CTO** - Chief Technology Officer
4. **CFO** - Chief Financial Officer
5. **EVP** - Executive Vice President
6. **SVP** - Senior Vice President
7. **VP** - Vice President
8. **DIRECTOR** - Director
9. **MANAGER** - Manager
10. **SENIOR_MEMBER** - Senior Team Member
11. **MEMBER** - Team Member
12. **OBSERVER** - Observer (read-only)

### Access Control Rules

- Higher levels can access all lower-level entities
- Same level can collaborate on shared entities
- OBSERVER level has read-only access
- Classification levels add additional restrictions

### Classification Levels

- **TOP_SECRET** - CEO, C-Suite only
- **SECRET** - VP level and above
- **CONFIDENTIAL** - Director level and above  
- **UNCLASSIFIED** - All levels

## Best Practices

### Organization Management

1. **Use Descriptive Names**
   ```bash
   # Good
   pmcs organization create -n "Customer Success Initiative 2024"
   
   # Avoid
   pmcs organization create -n "Org1"
   ```

2. **Set Appropriate Classifications**
   ```bash
   # For sensitive projects
   pmcs organization create -n "Security Audit" -c SECRET
   ```

3. **Document Purpose**
   ```bash
   pmcs organization create \
     -n "Digital Transformation" \
     -d "Company-wide digital transformation initiative focusing on cloud migration and process automation"
   ```

### Assignment Management

1. **Be Specific in Titles**
   ```bash
   # Good
   pmcs assignments create -t "Review Q4 financial projections for accuracy"
   
   # Avoid  
   pmcs assignments create -t "Review stuff"
   ```

2. **Set Realistic Due Dates**
   ```bash
   pmcs assignments create \
     -t "Complete user research" \
     --due-date 2024-12-15 \
     --priority MEDIUM
   ```

3. **Use Appropriate Priority Levels**
   - **CRITICAL** - Business-critical, immediate attention
   - **HIGH** - Important, complete within days
   - **MEDIUM** - Standard priority, complete within weeks
   - **LOW** - Nice to have, complete when possible

### Communication

1. **Clear Announcement Content**
   ```bash
   pmcs announcements create \
     -t "Office Closure - Labor Day" \
     -c "Office will be closed Monday, September 2nd for Labor Day. All staff should plan accordingly for project deadlines."
   ```

2. **Use Appropriate Types**
   - Use **URGENT** sparingly for truly urgent matters
   - Use **POLICY** for company policy changes
   - Use **SYSTEM** for technical notifications

### Git Workflow

1. **Commit Messages**
   - The system automatically creates meaningful commit messages
   - Each operation is atomic (all-or-nothing)

2. **Collaboration**
   - Multiple users can work simultaneously
   - Git handles merge conflicts automatically
   - All changes are tracked with full history

## Troubleshooting

### Common Issues

**"Not authenticated" Error**
```bash
# Solution: Login again
pmcs auth login -e your.email@company.com -p password
```

**"Insufficient permissions" Error**
```bash
# Check your current permissions
pmcs auth status

# Ensure you have the right corporate level for the operation
# Contact administrator to adjust permissions
```

**"Entity not found" Error**
```bash
# List available entities
pmcs organization list

# Use correct ID format
pmcs organization show <correct-id>
```

**Git Repository Issues**
```bash
# Check git status
git status

# If corrupted, reinitialize
rm -rf .git
pmcs init
```

### Getting Help

**Command-Specific Help**
```bash
pmcs help organization
pmcs organization --help
```

**General Help**
```bash
pmcs help
pmcs --help
```

**Verbose Output for Debugging**
```bash
pmcs --verbose organization create -n "Test Org"
```

### Performance Tips

1. **Use JSON Output for Scripting**
   ```bash
   pmcs organization list --format json | jq '.[] | .name'
   ```

2. **Filter Lists Instead of Loading All**
   ```bash
   pmcs assignments list --assigned-to-me --status IN_PROGRESS
   ```

3. **Use Specific Entity Commands**
   ```bash
   # Better than loading all organizations first
   pmcs organization show <known-id>
   ```

## Advanced Usage

### Scripting with PMCS

**Bash Script Example**
```bash
#!/bin/bash

# Login
pmcs auth login -e admin@pmcs.local -p admin123

# Create organization
ORG_ID=$(pmcs organization create -n "Automated Org" --format json | jq -r '.id')

# Create assignment in organization
pmcs assignments create \
  -t "Automated Task" \
  --entity organization/$ORG_ID \
  --assignee user@pmcs.local

echo "Setup complete for organization: $ORG_ID"
```

**Integration with CI/CD**
```bash
# In your deployment script
pmcs auth login -e ci@company.com -p $CI_PASSWORD
pmcs announcements create \
  -t "Deployment Complete" \
  -c "Version $VERSION deployed successfully" \
  --entity project/$PROJECT_ID \
  --publish-now
```

---

*This user guide covers the core functionality of PMCS Terminal. For technical details, see the API documentation.*