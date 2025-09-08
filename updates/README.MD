# Splendor Blockchain Update Script

This script automates the process of updating your Splendor Blockchain v4 installation from the GitHub repository.

## Features

- **Safe Updates**: Creates automatic backups before updating
- **Node Management**: Safely stops and restarts blockchain nodes
- **Dependency Management**: Automatically installs updated dependencies
- **Rollback Support**: Can restore from backup if update fails
- **Progress Tracking**: Visual progress indicators and colored output

## Usage

### Basic Update
\`\`\`bash
cd /root/splendor-blockchain-v4/updates
chmod +x update-splendor.sh
./update-splendor.sh
\`\`\`

### Available Options

- `--help` - Display help message
- `--force` - Force update even if already up to date
- `--skip-backup` - Skip creating backup (not recommended)
- `--no-restart` - Don't restart services after update
- `--check-only` - Only check for updates, don't apply them

### Examples

\`\`\`bash
# Normal update with backup
./update-splendor.sh

# Force update even if up to date
./update-splendor.sh --force

# Check for updates without applying
./update-splendor.sh --check-only

# Update without restarting services
./update-splendor.sh --no-restart
\`\`\`

## What the Script Does

1. **Environment Check**: Verifies the installation directory and git repository
2. **Backup Creation**: Creates a timestamped backup of the current installation
3. **Node Shutdown**: Safely stops all running RPC and validator nodes
4. **Update Check**: Fetches and compares with remote repository
5. **Code Update**: Pulls latest changes from GitHub
6. **Rebuild**: Installs dependencies and rebuilds the project
7. **Service Restart**: Restarts the blockchain nodes

## Safety Features

- Automatic backup creation before any changes
- Graceful node shutdown with retry logic
- Automatic rollback if update fails
- Verification of git repository status

## Requirements

- Git repository at `/root/splendor-blockchain-v4`
- tmux (for node management)
- Internet connection for GitHub access
- Sufficient disk space for backup

## Troubleshooting

If the update fails, the script will automatically attempt to restore from the backup. Manual restoration can be done by:

\`\`\`bash
# Check backup location
cat /root/splendor-blockchain-v4/.last_backup

# Manually restore if needed
cd /root
mv splendor-blockchain-v4 splendor-blockchain-v4-failed
mv [backup-directory] splendor-blockchain-v4
