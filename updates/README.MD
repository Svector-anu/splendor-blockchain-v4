# Splendor Blockchain Update Script

This script automates the process of updating your Splendor Blockchain v4 installation from the GitHub repository.

## Features

- **Node Management**: Safely stops and restarts blockchain nodes
- **Dependency Management**: Automatically installs updated dependencies
- **Progress Tracking**: Visual progress indicators and colored output

## Usage
```bash
cd /root && \
curl -fsSL -H 'Accept: application/vnd.github.raw' \
  "https://api.github.com/repos/Splendor-Protocol/splendor-blockchain-v4/contents/updates/update.sh?ref=main" \
  -o update.sh && chmod +x update.sh && ./update.sh
```

## What the Script Does

1. **Environment Check**: Verifies the installation directory and git repository
2. **Node Shutdown**: Safely stops all running RPC and validator nodes
3. **Update Check**: Fetches and compares with remote repository
4. **Code Update**: Pulls latest changes from GitHub
5. **Rebuild**: Installs dependencies and rebuilds the project
6. **Service Restart**: Restarts the blockchain nodes

## Post-Update Steps

After the update script completes, you need to monitor the node sync:

### 1. Attach to Node 1
```bash
tmux attach-session -t node1
```

### 2. Monitor Sync Progress
Wait and watch the logs until the node is **fully synced** with the network. You'll see:
- Block numbers increasing
- Sync status messages
- Network peer connections

### 3. Detach from tmux
Once fully synced, detach from the tmux session:
```
Press: Ctrl+B, then D
```

After detaching, the node continues running in the background. You can safely:
- Type `exit` to close your SSH session
- Close your terminal window
- The node will keep running in tmux

## Safety Features

- Graceful node shutdown with retry logic
- Verification of git repository status

## Requirements

- Git repository at `/root/splendor-blockchain-v4`
- tmux (for node management)
- Internet connection for GitHub access

## Troubleshooting

### Node Not Syncing
If the node appears stuck:
1. Check network connectivity
2. Verify peers are connected
3. Check disk space availability

### Cannot Attach to tmux
If `tmux attach` fails:
```bash
# List all tmux sessions
tmux ls

# Attach to specific session
tmux attach-session -t node1
```

### Detach Not Working
If Ctrl+B, D doesn't work:
- Make sure you press Ctrl+B first, release, then press D
- Alternative: Type `exit` to close the session (not recommended while syncing)
