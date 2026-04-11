#!/bin/bash
# Activation script for guildpost project

# Change to project directory
PROJECT_DIR="/home/justin-lo/projects/guildpost"
cd "$PROJECT_DIR" || exit 1

export OBSIDIAN_VAULT_PATH="/home/justin-lo/obsidian-vaults/guildpost"
export OP_VAULT="guildpost"
export PROJECT_NAME="guildpost"

echo "🚀 Activating Hermes for project: guildpost"
echo "   Directory: $PROJECT_DIR"
echo "   Obsidian: $OBSIDIAN_VAULT_PATH"
echo "   1Password vault: $OP_VAULT"

if [ $# -eq 0 ]; then
    hermes --profile guildpost
else
    hermes --profile guildpost "$@"
fi
