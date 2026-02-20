#!/bin/bash
#
# yt-dlp-rollback.sh - Rollback yt-dlp to a previous version
#
# Usage:
#   ./yt-dlp-rollback.sh              # Interactive: lists available versions
#   ./yt-dlp-rollback.sh 2026.02.04   # Direct: rollback to specific version

BINARY_PATH="/usr/local/bin/yt-dlp"
BACKUP_DIR="/home/monty/backups/yt-dlp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=== yt-dlp Rollback Utility ==="
echo ""

# Show current version
if [[ -f "$BINARY_PATH" ]]; then
    CURRENT=$("$BINARY_PATH" --version 2>/dev/null || echo "unknown")
    echo -e "Current version: ${GREEN}$CURRENT${NC}"
else
    echo -e "Current version: ${RED}not installed${NC}"
fi
echo ""

# List available backups
echo "Available backups:"
if [[ -d "$BACKUP_DIR" ]] && ls "$BACKUP_DIR"/yt-dlp-* 1>/dev/null 2>&1; then
    BACKUPS=($(ls -t "$BACKUP_DIR"/yt-dlp-* | xargs -n1 basename | sed 's/yt-dlp-//'))
    for i in "${!BACKUPS[@]}"; do
        VERSION="${BACKUPS[$i]}"
        if [[ "$VERSION" == "$CURRENT" ]]; then
            echo -e "  $((i+1)). $VERSION ${YELLOW}(current)${NC}"
        else
            echo "  $((i+1)). $VERSION"
        fi
    done
else
    echo -e "  ${RED}No backups found${NC}"
    exit 1
fi
echo ""

# If version provided as argument, use it
if [[ -n "$1" ]]; then
    TARGET_VERSION="$1"
else
    # Interactive selection
    read -p "Enter version number to restore (or q to quit): " SELECTION

    if [[ "$SELECTION" == "q" || "$SELECTION" == "Q" ]]; then
        echo "Cancelled."
        exit 0
    fi

    # Check if selection is a number (index) or version string
    if [[ "$SELECTION" =~ ^[0-9]+$ ]]; then
        INDEX=$((SELECTION - 1))
        if [[ $INDEX -ge 0 && $INDEX -lt ${#BACKUPS[@]} ]]; then
            TARGET_VERSION="${BACKUPS[$INDEX]}"
        else
            echo -e "${RED}Invalid selection${NC}"
            exit 1
        fi
    else
        TARGET_VERSION="$SELECTION"
    fi
fi

# Validate backup exists
BACKUP_FILE="$BACKUP_DIR/yt-dlp-$TARGET_VERSION"
if [[ ! -f "$BACKUP_FILE" ]]; then
    echo -e "${RED}Error: Backup not found: $BACKUP_FILE${NC}"
    exit 1
fi

# Confirm
echo -e "Rolling back to: ${GREEN}$TARGET_VERSION${NC}"
read -p "Continue? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Cancelled."
    exit 0
fi

# Perform rollback
sudo cp "$BACKUP_FILE" "$BINARY_PATH"
sudo chmod a+rx "$BINARY_PATH"

# Verify
RESTORED=$("$BINARY_PATH" --version 2>/dev/null || echo "failed")
if [[ "$RESTORED" == "$TARGET_VERSION" ]]; then
    echo -e "${GREEN}SUCCESS: Restored to version $TARGET_VERSION${NC}"
else
    echo -e "${RED}WARNING: Version mismatch after restore (got: $RESTORED)${NC}"
fi
