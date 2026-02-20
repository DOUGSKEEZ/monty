# yt-dlp Auto-Update & Rollback System

## Overview
yt-dlp is the backbone of Monty's Jukebox feature — it handles YouTube search, stream URL resolution, and MP3 downloads. YouTube frequently changes its internals, so yt-dlp releases updates often to keep up. This system ensures Monty always has a working yt-dlp, with automatic weekly updates and easy rollback if an update breaks something.

## Quick Status
- **Binary**: `/usr/local/bin/yt-dlp` (standalone, not pip)
- **Auto-Update**: ✅ Weekly via systemd timer (Sundays 4 AM MST)
- **Backups**: `~/backups/yt-dlp/` — one binary per version
- **Rollback**: `~/monty/scripts/yt-dlp-rollback.sh` — interactive version picker

## How It Works

```
Sunday 4 AM
     │
     ▼
yt-dlp-update.timer
     │
     ▼
yt-dlp-update.service
     │
     ▼
scripts/yt-dlp-update.sh
     ├── 1. Record current version
     ├── 2. Back up current binary → ~/backups/yt-dlp/yt-dlp-{version}
     ├── 3. Download latest from GitHub releases
     ├── 4. Verify new binary runs
     ├── 5. Clean up old backups (keeps last 10)
     └── 6. Log result (journal)
```

## Files

| File | Location | Purpose |
|------|----------|---------|
| `yt-dlp-update.sh` | `~/monty/scripts/` | Update script with backup logic |
| `yt-dlp-rollback.sh` | `~/monty/scripts/` | Interactive rollback to previous version |
| `yt-dlp-migrate-to-standalone.sh` | `~/monty/scripts/` | One-time migration from pip (already ran) |
| `yt-dlp-update.service` | `/etc/systemd/system/` | Systemd service unit |
| `yt-dlp-update.timer` | `/etc/systemd/system/` | Systemd timer (weekly) |
| Backup binaries | `~/backups/yt-dlp/` | Version archive for rollback (keeps last 10) |

## Common Commands

### Check current version
```bash
yt-dlp --version
```

### Check when the next auto-update runs
```bash
systemctl list-timers | grep yt-dlp
```

### View update logs
```bash
journalctl -u yt-dlp-update.service --no-pager -n 20
```

### Force a manual update now
```bash
sudo /home/monty/monty/scripts/yt-dlp-update.sh
```

### List available backups
```bash
ls -la ~/backups/yt-dlp/
```

### Roll back to a previous version
```bash
cd ~/monty/scripts
./yt-dlp-rollback.sh
```

This shows available backups and lets you pick which version to restore.

### Manual rollback (if the script doesn't work)
```bash
# List backups
ls ~/backups/yt-dlp/

# Copy the version you want back into place
sudo cp ~/backups/yt-dlp/yt-dlp-2026.02.04 /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Verify
yt-dlp --version
```

## Troubleshooting

### Jukebox YouTube search/playback stops working
This almost always means YouTube changed something and yt-dlp needs an update.

```bash
# Try updating first
sudo /home/monty/monty/scripts/yt-dlp-update.sh

# If the latest version is ALSO broken (rare), check yt-dlp GitHub issues:
# https://github.com/yt-dlp/yt-dlp/issues
# A fix is usually released within 24-48 hours.
```

### "Sign in to confirm you're not a bot" error
YouTube rate-limiting. This happens with rapid-fire searches during testing, not normal usage. Wait 10-15 minutes and it resolves. If persistent, the yt-dlp version may be too old — update it.

### Auto-update timer not running
```bash
# Check timer status
systemctl status yt-dlp-update.timer

# If inactive, re-enable
sudo systemctl enable --now yt-dlp-update.timer
```

### Update downloaded but Jukebox still broken
Restart the Monty backend so JukeboxService picks up the new binary:

```bash
cd /home/monty/monty && ./prod-restart-backend.sh
# or: sudo systemctl restart monty-backend.service
```

## Why Standalone Binary (Not pip)
We migrated from pip to standalone binary on 2026-02-20. Reasons:

- **Single-file backups** — `cp` works, no Python site-packages to track
- **No pip conflicts** — avoids `--break-system-packages` and dependency issues
- **Faster startup** — direct binary execution vs Python interpreter
- **Official recommendation** — yt-dlp maintainers prefer this for production

**Important:** We use `yt-dlp_linux` (ELF binary), NOT `yt-dlp` (Python zip archive). The zip archive has plugin directory issues that cause crashes.

## Deno Dependency
Recent yt-dlp versions require an external JavaScript runtime for YouTube's JS challenge solving. Deno is installed at:

```
~/.deno/bin/deno (v2.6.10)
```

**Why Deno?** YouTube uses JavaScript-based bot detection. When yt-dlp encounters these challenges, it needs a JS runtime to execute the challenge code. Without Deno, you'll see warnings like "No supported JavaScript runtime could be found" — currently non-blocking but may become mandatory in future versions.

**Note:** Datadog APM's system-level injection (`/etc/ld.so.preload`) conflicted with Deno and was disabled on 2026-02-20. See `INSTRUCTIONS_TO_DECOMM_APM.md` for details.

## Audio Quality Reference
Both Jukebox audio paths are configured for maximum quality:

| Path | Flag | Effect |
|------|------|--------|
| Streaming | `-f bestaudio` | Highest bitrate stream YouTube offers |
| Saving to ~/Music | `--audio-quality 0` | Best VBR (~245 kbps MP3) |

## History
- **2024.04.09** — Original apt-installed version (ancient, caused bot detection)
- **2026.02.04** — Upgraded via pip during Jukebox Phase 0 development
- **2026.02.20** — Migrated to standalone ELF binary (`yt-dlp_linux`), added auto-update & rollback system
- **2026.02.20** — Installed Deno 2.6.10 for YouTube JS challenge solving, disabled Datadog APM injection
