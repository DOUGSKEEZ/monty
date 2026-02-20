#!/bin/bash
#
# yt-dlp-update.sh - Auto-update yt-dlp with backup and verification
#
# This script:
# 1. Backs up the current yt-dlp binary with version stamp
# 2. Downloads the latest standalone binary from GitHub
# 3. Verifies the new version works
# 4. Rolls back automatically if verification fails
#
# Designed to run via systemd timer (weekly)

set -e

BINARY_PATH="/usr/local/bin/yt-dlp"
BACKUP_DIR="/home/monty/backups/yt-dlp"
LOG_TAG="yt-dlp-update"
DOWNLOAD_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"

log() {
    logger -t "$LOG_TAG" "$1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Get current version (if yt-dlp exists)
if [[ -f "$BINARY_PATH" ]]; then
    CURRENT_VERSION=$("$BINARY_PATH" --version 2>/dev/null || echo "unknown")
    log "Current version: $CURRENT_VERSION"

    # Back up current binary
    BACKUP_FILE="$BACKUP_DIR/yt-dlp-$CURRENT_VERSION"
    if [[ ! -f "$BACKUP_FILE" ]]; then
        cp "$BINARY_PATH" "$BACKUP_FILE"
        log "Backed up to: $BACKUP_FILE"
    else
        log "Backup already exists: $BACKUP_FILE"
    fi
else
    CURRENT_VERSION="none"
    log "No existing yt-dlp found, performing fresh install"
fi

# Download latest binary
log "Downloading latest yt-dlp..."
TEMP_FILE=$(mktemp)
if ! curl -L --fail --silent --show-error "$DOWNLOAD_URL" -o "$TEMP_FILE"; then
    log "ERROR: Download failed"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Make executable
chmod a+rx "$TEMP_FILE"

# Verify it's an ELF binary (not the Python zip archive)
FILE_TYPE=$(file "$TEMP_FILE" 2>/dev/null || echo "")
if [[ ! "$FILE_TYPE" =~ "ELF" ]]; then
    log "ERROR: Downloaded file is not an ELF binary (got: $FILE_TYPE)"
    log "ERROR: This may indicate the wrong download URL or a GitHub issue"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Verify the downloaded binary works
NEW_VERSION=$("$TEMP_FILE" --version 2>/dev/null || echo "")
if [[ -z "$NEW_VERSION" ]]; then
    log "ERROR: Downloaded binary failed verification"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Check if we actually got a newer version
if [[ "$NEW_VERSION" == "$CURRENT_VERSION" ]]; then
    log "Already at latest version: $CURRENT_VERSION"
    rm -f "$TEMP_FILE"
    exit 0
fi

# Install the new binary
mv "$TEMP_FILE" "$BINARY_PATH"
chmod a+rx "$BINARY_PATH"

log "SUCCESS: Updated from $CURRENT_VERSION to $NEW_VERSION"

# Clean up old backups (keep last 10)
cd "$BACKUP_DIR"
ls -t yt-dlp-* 2>/dev/null | tail -n +11 | xargs -r rm -f
BACKUP_COUNT=$(ls -1 yt-dlp-* 2>/dev/null | wc -l)
log "Backup cleanup complete ($BACKUP_COUNT versions retained)"
