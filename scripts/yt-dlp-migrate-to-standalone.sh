#!/bin/bash
#
# yt-dlp-migrate-to-standalone.sh - Migrate from pip install to standalone binary
#
# This script:
# 1. Records the current pip-installed version
# 2. Downloads the standalone binary (same version if available, or latest)
# 3. Verifies it works
# 4. Uninstalls the pip version
# 5. Installs the standalone binary
#
# Run with sudo

set -e

BINARY_PATH="/usr/local/bin/yt-dlp"
BACKUP_DIR="/home/monty/backups/yt-dlp"
DOWNLOAD_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=== yt-dlp Migration: pip -> standalone binary ==="
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This script must be run with sudo${NC}"
    echo "Usage: sudo ./yt-dlp-migrate-to-standalone.sh"
    exit 1
fi

# Check current installation
if ! command -v yt-dlp &> /dev/null; then
    echo -e "${YELLOW}No yt-dlp found, performing fresh install...${NC}"
    CURRENT_VERSION="none"
else
    CURRENT_VERSION=$(yt-dlp --version)
    CURRENT_PATH=$(which yt-dlp)
    echo "Current installation:"
    echo "  Version: $CURRENT_VERSION"
    echo "  Path: $CURRENT_PATH"
fi
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Download standalone binary to temp location
echo "Downloading standalone binary..."
TEMP_FILE=$(mktemp)
if ! curl -L --fail --progress-bar "$DOWNLOAD_URL" -o "$TEMP_FILE"; then
    echo -e "${RED}Error: Download failed${NC}"
    rm -f "$TEMP_FILE"
    exit 1
fi
chmod a+rx "$TEMP_FILE"

# Verify it's an ELF binary (not the Python zip archive)
FILE_TYPE=$(file "$TEMP_FILE" 2>/dev/null || echo "")
if [[ ! "$FILE_TYPE" =~ "ELF" ]]; then
    echo -e "${RED}Error: Downloaded file is not an ELF binary${NC}"
    echo "Got: $FILE_TYPE"
    echo "This may indicate the wrong download URL was used."
    rm -f "$TEMP_FILE"
    exit 1
fi

# Verify it works
NEW_VERSION=$("$TEMP_FILE" --version 2>/dev/null || echo "")
if [[ -z "$NEW_VERSION" ]]; then
    echo -e "${RED}Error: Downloaded binary failed verification${NC}"
    rm -f "$TEMP_FILE"
    exit 1
fi
echo -e "Downloaded version: ${GREEN}$NEW_VERSION${NC}"
echo ""

# Uninstall pip version if it exists
if pip3 show yt-dlp &> /dev/null; then
    echo "Removing pip-installed yt-dlp..."
    pip3 uninstall -y yt-dlp --break-system-packages 2>/dev/null || pip3 uninstall -y yt-dlp
    echo -e "${GREEN}Pip version removed${NC}"
fi

# Install standalone binary
echo "Installing standalone binary..."
mv "$TEMP_FILE" "$BINARY_PATH"
chmod a+rx "$BINARY_PATH"

# Create initial backup
BACKUP_FILE="$BACKUP_DIR/yt-dlp-$NEW_VERSION"
cp "$BINARY_PATH" "$BACKUP_FILE"
echo "Initial backup created: $BACKUP_FILE"

# Final verification
FINAL_VERSION=$("$BINARY_PATH" --version 2>/dev/null || echo "failed")
echo ""
if [[ "$FINAL_VERSION" == "$NEW_VERSION" ]]; then
    echo -e "${GREEN}=== Migration Complete ===${NC}"
    echo ""
    echo "yt-dlp is now installed as a standalone binary:"
    echo "  Path: $BINARY_PATH"
    echo "  Version: $FINAL_VERSION"
    echo ""
    echo "Next steps:"
    echo "  1. Test: yt-dlp --version"
    echo "  2. Enable auto-updates: see instructions in scripts/README"
else
    echo -e "${RED}Error: Migration may have failed (version: $FINAL_VERSION)${NC}"
    exit 1
fi
