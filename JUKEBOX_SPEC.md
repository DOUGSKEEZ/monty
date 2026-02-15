# 🎹 Monty Jukebox — Feature Spec

*Designed: February 14, 2026*
*Status: Ready to Build*

---

## Vision

Extend the existing Pianobar (Pandora) page with **YouTube on-demand requests** and a **local music library** — like walking up to a pianist at a piano bar and making a request. The user scrolls below the existing Pianobar "Now Playing" area, searches YouTube, and plays audio directly through Monty's speakers. They can optionally save tracks to build a personal library over time.

**This is NOT a separate page.** It lives below the existing Pianobar UI on the same page, as an extension of the music experience.

---

## Architecture Overview

```
React Frontend (Pianobar Page — extended)
  ├── 🎵 Now Playing (unified — shows whatever source is active)
  │   └── Transport: Play/Pause, Stop, Next, Volume
  ├── 🎶 Pianobar / Pandora Section (existing, mostly unchanged)
  ├── 🎹 Make a Request (YouTube search + results)
  │   └── On Deck / In the Hole queue display
  └── 📁 My Library (~/Music)

Node.js Backend
  ├── PianobarService (existing)
  ├── JukeboxService (NEW) ← wraps node-mpv + yt-dlp
  └── AudioBroker (NEW) ← kill-and-play coordinator
  
WebSocket (existing channel, extended with source field)

Audio Path
  └── mpv → PulseAudio → Bluetooth → Klipsch The Fives
```

### Key Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| YouTube search | `yt-dlp --flat-playlist` | 1-2 second results, no external service needed |
| Audio playback | `mpv` via `node-mpv` npm package | IPC socket control, playlist support, audio filters, plays URLs + local files |
| mpv control | `node-mpv` (npm) | Node.js wrapper with full IPC, events, playlist mgmt — no custom socket code |
| Source conflicts | AudioBroker (kill-and-play) | Simplest model; only one source plays at a time |
| YouTube streaming | Stream-first, save optional | Instant playback; no download delay. Save triggers background download |
| Download tool | `yt-dlp -x --audio-format mp3` | Background download, audio extraction |
| Volume normalization | `mpv --af=loudnorm` | Prevents speaker damage from inconsistent YouTube levels |
| Local library | `~/Music/` directory | Simple flat directory of `{Artist} - {Title}.mp3` files |
| Content filtering | None | Trusted household feature |

### Pre-installed on Monty

- **mpv 0.37.0** — already installed
- **yt-dlp** — already installed
- **PulseAudio** — configured for Bluetooth output to Klipsch The Fives
- **Node.js v22.21.0** — existing backend

### Needs to be installed

- **`node-mpv`** — `npm install node-mpv` in the backend project
- **mpv must have yt-dlp integration** — verify with: `mpv --no-video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"` (if this doesn't work, the two-step URL resolution approach is used instead — see Playback Flow)

---

## Component Specifications

### 1. AudioBroker (NEW — Backend)

A thin coordination layer that ensures only one audio source plays at a time. This also fixes the existing bug where clio-chat (the LLM) can start duplicate pianobar instances.

**Responsibilities:**
- Track which source is currently active: `"pianobar"`, `"jukebox"`, or `"none"`
- Before ANY playback starts (from any source), kill the currently active source
- Prevent duplicate instances (pianobar-on-pianobar, mpv-on-mpv)
- All existing pianobar start/stop calls should route through AudioBroker

**Kill logic:**
- Before `jukebox.play()` → `pkill pianobar` (if pianobar active)
- Before `pianobar.start()` → `jukebox.stop()` (if jukebox active)
- Before `pianobar.start()` → `pkill pianobar` (prevent duplicates)
- Before `jukebox.play()` → ensure mpv is reset (prevent stale state)

**Integration point:** AudioBroker should be injected into both PianobarService and JukeboxService. Both services call `audioBroker.acquirePlayback(source)` before starting playback. AudioBroker handles the killing.

---

### 2. JukeboxService (NEW — Backend)

The main service that handles YouTube search, playback via mpv, download/save, and queue management.

**Dependencies:**
- `node-mpv` npm package
- `yt-dlp` (system binary, via `child_process`)
- AudioBroker

#### 2a. mpv Player Management

Initialize `node-mpv` in audio-only mode with volume normalization:

```javascript
const mpvPlayer = new mpv({
  audio_only: true,
  verbose: true,
  socket: "/tmp/monty-jukebox.sock"
}, [
  "--no-video",
  "--af=loudnorm",        // Volume normalization - CRITICAL for speaker safety
  "--volume=70",           // Default safe volume
  "--no-config",           // Avoid mpv plugin conflicts
  "--load-scripts=no"      // Avoid autoload.lua issues with rapid loads
]);
```

**Transport controls exposed via REST API:**
- `POST /api/jukebox/play` — resume paused playback
- `POST /api/jukebox/pause` — pause current playback
- `POST /api/jukebox/stop` — stop playback entirely
- `POST /api/jukebox/next` — skip to next in queue (on-deck)
- `POST /api/jukebox/volume` — set volume `{ level: 0-100 }`

**mpv events to listen for and relay via WebSocket:**
- `statuschange` → push now-playing state
- `stopped` → update state to idle, play next in queue if available
- `timeposition` → update playback progress (for progress bar)

#### 2b. YouTube Search

**Endpoint:** `GET /api/jukebox/search?q=Michael+Jackson+Beat+It&offset=0`

**Implementation:** Spawn `yt-dlp` as a child process:

```bash
yt-dlp "ytsearch5:Michael Jackson Beat It" --flat-playlist --print "%(title)s\t%(id)s\t%(duration)s"
```

- Use tab-delimited (`\t`) output for reliable parsing (titles can contain `|`)
- Return 5 results per search
- `offset` parameter: for "Next 5" functionality, use `ytsearch10` and slice, or re-search with `ytsearch5` offset (test which is faster)
- Parse results into array of: `{ title, youtubeId, duration, parsedArtist, parsedTitle }`

**Title parser (for pre-populating save modal):**

Pre-scrub rules (applied before splitting):
1. If first `(` is immediately followed by "ft" (case-insensitive) → remove that set of parentheses, keep content. e.g. `"Song (ft. Dr. Dre)"` → `"Song ft. Dr. Dre"`
2. If first `(` is immediately followed by "instrumental" (case-insensitive) → remove those parentheses, append ` - Instrumental` to end. e.g. `"Song (Instrumental)"` → `"Song - Instrumental"`

Split rules:
1. Split on first `" - "` → everything before = `parsedArtist`, everything after = remainder
2. Truncate remainder at first `"("` → result = `parsedTitle`
3. Trim whitespace from both fields

Edge cases:
- No `" - "` in title → `parsedArtist` = empty string, `parsedTitle` = full title (truncated at first `(`)
- User can always edit both fields in save modal

**Search response shape:**
```json
{
  "results": [
    {
      "title": "Michael Jackson - Beat It (Official 4K Video)",
      "youtubeId": "oRdxUFDoQe0",
      "duration": 299,
      "parsedArtist": "Michael Jackson",
      "parsedTitle": "Beat It"
    }
  ]
}
```

#### 2c. Playback Flow

When user clicks ▶ Play on a search result:

1. Frontend sends `POST /api/jukebox/play-youtube` with `{ youtubeId }`
2. JukeboxService calls `audioBroker.acquirePlayback("jukebox")` (kills pianobar or stale mpv)
3. **Two-step URL resolution (preferred approach — less "black box"):**
   - Run: `yt-dlp -g --no-playlist "https://www.youtube.com/watch?v={youtubeId}"` to get direct stream URL
   - Pass resolved URL to `mpvPlayer.load(resolvedUrl)`
4. JukeboxService emits now-playing state via WebSocket

**For local library files:**
1. Frontend sends `POST /api/jukebox/play-local` with `{ filepath }`
2. JukeboxService calls `audioBroker.acquirePlayback("jukebox")`
3. `mpvPlayer.load(filepath)` directly
4. Emit now-playing state

#### 2d. Save/Download (Background)

**Endpoint:** `POST /api/jukebox/save`

**Request body:**
```json
{
  "youtubeId": "oRdxUFDoQe0",
  "artist": "Michael Jackson",
  "title": "Beat It"
}
```

**Implementation:**
1. Validate artist/title are non-empty, sanitize for filesystem (remove `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
2. Construct filename: `{Artist} - {Title}.mp3`
3. Check if file already exists in `~/Music/` — if so, return error "Track already exists"
4. Spawn background process:
   ```bash
   yt-dlp -x --audio-format mp3 --audio-quality 0 -o "/home/monty/Music/{Artist} - {Title}.%(ext)s" "https://www.youtube.com/watch?v={youtubeId}"
   ```
5. Return immediately with `{ status: "saving", filename: "Michael Jackson - Beat It.mp3" }`
6. When download completes, emit WebSocket event: `{ type: "save-complete", filename: "..." }`
7. If download fails, emit: `{ type: "save-failed", filename: "...", error: "..." }`

**Frontend behavior:** Non-blocking toast notification. "Saving Beat It..." appears immediately, then "✅ Saved!" or "❌ Save failed" when the WebSocket event arrives.

#### 2e. Delete Track

**Endpoint:** `DELETE /api/jukebox/library/{filename}`

- Delete the file from `~/Music/`
- If the deleted track is currently playing, stop playback
- Return confirmation

#### 2f. Library Listing

**Endpoint:** `GET /api/jukebox/library`

- Scan `~/Music/` for `.mp3` files
- Parse filenames back into artist/title using the `{Artist} - {Title}.mp3` convention
- Return sorted by most recently modified (for "Recently Saved" default view)

**Response shape:**
```json
{
  "tracks": [
    {
      "filename": "Michael Jackson - Beat It.mp3",
      "artist": "Michael Jackson",
      "title": "Beat It",
      "filepath": "/home/monty/Music/Michael Jackson - Beat It.mp3",
      "savedAt": "2026-02-14T17:30:00Z",
      "sizeMB": 4.2
    }
  ]
}
```

**Sort options (handled client-side for MVP):**
- Recently Saved (default — by `savedAt` descending)
- A-Z by Artist
- A-Z by Song Title
- Search/filter text input

#### 2g. Queue Management — "On Deck" and "In the Hole"

A simple 2-slot queue for **library tracks only** (not YouTube streams).

**State:**
```json
{
  "onDeck": { "filename": "...", "artist": "...", "title": "..." },
  "inTheHole": { "filename": "...", "artist": "...", "title": "..." }
}
```

**Behavior:**
- When current track ends (`mpv stopped` event): if `onDeck` exists, play it. Promote `inTheHole` to `onDeck`.
- User can add library tracks to queue via a "Queue" button (adds to first empty slot)
- User can clear/remove individual queue slots
- Queue state is visible in the UI ("On Deck" / "In the Hole" display)
- Hitting "Next" on transport controls skips to `onDeck` track

**API:**
- `GET /api/jukebox/queue` — current queue state
- `POST /api/jukebox/queue` — add track to queue `{ filepath }`
- `DELETE /api/jukebox/queue/:slot` — remove from `onDeck` or `inTheHole`

---

### 3. WebSocket Extension (Existing Channel)

Extend the existing Pianobar WebSocket to include jukebox state. Messages include a `source` field so the frontend knows which source is active:

```json
{
  "source": "pianobar",
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "album": "A Night at the Opera",
  "station": "Classic Rock Radio",
  "isPlaying": true
}
```

```json
{
  "source": "jukebox",
  "title": "Beat It",
  "artist": "Michael Jackson",
  "duration": 299,
  "position": 45,
  "isPlaying": true,
  "queueOnDeck": "Thriller - Michael Jackson",
  "queueInTheHole": null
}
```

```json
{
  "source": "none",
  "isPlaying": false
}
```

**Events also pushed via WebSocket:**
- `save-complete` / `save-failed` — for toast notifications
- `queue-updated` — when queue changes

**PRE-IMPLEMENTATION TASK:** Before building new WebSocket features, Claude Code should thoroughly review the existing Pianobar WebSocket implementation. Investigate whether the existing pianobar "Now Playing" and transport UI components can be generalized to work with both pianobar and jukebox sources. If so, refactor to share components. If the coupling is too tight to pianobar-specific concepts, create a shared/abstract transport component. Claude Code makes this call after reviewing the actual React code.

---

### 4. Frontend UI (React)

The Jukebox UI lives **below the existing Pianobar section** on the same page. The user scrolls down to "walk up to the pianist."

#### 4a. Now Playing (Unified)

The Now Playing area at the top of the page should display whatever is currently active — pianobar OR jukebox. It reads from the unified WebSocket messages.

**For jukebox playback, display:**
- Track title and artist
- Source indicator (e.g., small "YouTube" or "Library" badge)
- Progress bar (position / duration) — mpv reports this via `timeposition` event
- Transport controls: Play/Pause, Stop, Next

**For pianobar playback:** existing display, unchanged.

**When nothing is playing:** show idle state.

**Investigation required:** Review existing pianobar Now Playing component to determine refactor approach (see WebSocket section above).

#### 4b. Pianobar Section

Existing UI. Largely unchanged. The only integration point is that starting pianobar goes through AudioBroker, which will kill any active jukebox playback.

#### 4c. 🎹 Make a Request Section

**Search area:**
- Text input field with placeholder "Search YouTube..."
- 🔍 Search button (also triggered by Enter key)
- Loading spinner during search (1-2 seconds)

**Results area (appears after search):**
- List of 5 results, each showing:
  - Title (full YouTube title)
  - Duration (formatted as M:SS)
  - `[▶ Play]` button — streams immediately via mpv
  - `[💾 Save]` button — opens save modal
- `[Next 5 →]` button at bottom for additional results
- Results area clears/replaces when a new search is performed

**Save Modal (triggered by 💾):**
- Overlay/modal with two fields:
  - **Artist** field — pre-populated by title parser
  - **Title** field — pre-populated by title parser
- Each field has a small `[✕]` clear button for easy manual entry
- `[Save]` button — triggers background download, closes modal, shows toast
- `[Cancel]` button — closes modal
- The modal does NOT block playback — the track can be playing while you save it

**Queue display (below results):**
- "⚾ On Deck:" — shows queued track name or "empty"
- "⚾ In the Hole:" — shows queued track name or "empty"
- Each slot has an `[✕]` button to remove it

#### 4d. 📁 My Library Section

**View toggle:** `[Recently Saved]` `[A-Z by Artist]` `[A-Z by Song]`

**Search/filter:** Text input that filters the visible list in real-time

**Track list:** Each track shows:
- `♫ {Artist} - {Title}`
- `[▶ Play]` button — plays via jukebox (kills pianobar if active)
- `[➕ Queue]` button — adds to On Deck or In the Hole (next empty slot)
- `[🗑 Delete]` button — confirmation prompt, then deletes file

**Empty state:** When library is empty, show friendly message: "No saved tracks yet. Search YouTube above and save your favorites!"

---

### 5. API Route Summary

All new routes live under `/api/jukebox/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jukebox/search?q=...&offset=0` | YouTube search |
| POST | `/api/jukebox/play-youtube` | Stream YouTube by ID |
| POST | `/api/jukebox/play-local` | Play local file |
| POST | `/api/jukebox/play` | Resume paused playback |
| POST | `/api/jukebox/pause` | Pause playback |
| POST | `/api/jukebox/stop` | Stop playback |
| POST | `/api/jukebox/next` | Skip to on-deck track |
| POST | `/api/jukebox/volume` | Set volume |
| GET | `/api/jukebox/status` | Current playback state |
| POST | `/api/jukebox/save` | Download/save track |
| GET | `/api/jukebox/library` | List saved tracks |
| DELETE | `/api/jukebox/library/:filename` | Delete saved track |
| GET | `/api/jukebox/queue` | Get queue state |
| POST | `/api/jukebox/queue` | Add to queue |
| DELETE | `/api/jukebox/queue/:slot` | Remove from queue |

---

## Implementation Order

### Phase 0: Prerequisites & Investigation
1. Install `node-mpv` npm package in backend
2. Verify mpv + yt-dlp integration on monty: `mpv --no-video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
3. If direct URL playback fails, confirm two-step approach works: `yt-dlp -g <url>` → pipe to mpv
4. Create `~/Music/` directory if it doesn't exist
5. **CRITICAL:** Review existing Pianobar React components, WebSocket implementation, and Now Playing UI. Document findings on what can be reused/generalized vs. what needs new components.

### Phase 1: Backend Foundation
1. Build AudioBroker — integrate with existing PianobarService (fixes double-pianobar bug!)
2. Build JukeboxService core — mpv player management via `node-mpv`
3. Add YouTube search endpoint (yt-dlp --flat-playlist)
4. Add playback endpoints (play-youtube, play-local, pause, stop, next, volume)
5. Test: Can we search YouTube and play audio through the speakers from the API?

### Phase 2: WebSocket & Now Playing
1. Extend existing WebSocket with `source` field and jukebox events
2. Build or refactor unified Now Playing component (based on Phase 0 investigation)
3. Add transport controls that work for both sources
4. Test: Does Now Playing update correctly when switching between pianobar and jukebox?

### Phase 3: Frontend — Make a Request
1. Build YouTube search UI (search box, results list)
2. Wire up Play buttons to jukebox API
3. Build save modal with title parser pre-population
4. Add toast notification system for save status
5. Add "Next 5" pagination for search results
6. Test: Full flow — search, play, save, toast confirmation

### Phase 4: Library & Queue
1. Add save/download endpoint (background yt-dlp)
2. Add library listing endpoint (scan ~/Music/)
3. Add delete endpoint
4. Build library UI (Recently Saved, A-Z views, search filter)
5. Build queue system (On Deck / In the Hole)
6. Wire queue display into UI
7. Test: Save a track, see it in library, play from library, queue tracks

### Phase 5: Polish
1. Error handling for all failure modes (yt-dlp fails, mpv crashes, network issues)
2. Edge case: very long YouTube titles in search results (truncation in UI)
3. Edge case: duplicate save attempts (same filename)
4. Edge case: playing a very long stream (1-hour YouTube mixes) — progress bar behavior
5. Edge case: rapid play/stop/play cycles — ensure AudioBroker is resilient
6. Loading states and spinners for all async operations

---

## File Structure (New Files)

```
backend/
├── services/
│   ├── AudioBroker.js              # Kill-and-play coordinator
│   └── JukeboxService.js           # mpv + yt-dlp wrapper
├── routes/
│   └── jukebox.js                  # /api/jukebox/* routes
└── utils/
    └── titleParser.js              # YouTube title → artist/title parser

frontend/src/
├── components/
│   ├── Jukebox/
│   │   ├── YouTubeSearch.jsx       # Search box + results
│   │   ├── SearchResult.jsx        # Individual result row
│   │   ├── SaveModal.jsx           # Artist/title save dialog
│   │   ├── QueueDisplay.jsx        # On Deck / In the Hole
│   │   ├── LibraryBrowser.jsx      # Track list with sort/filter
│   │   └── LibraryTrack.jsx        # Individual library track row
│   └── shared/
│       └── Toast.jsx               # Non-blocking notification (if not already exists)
```

---

## Notes for Claude Code

- **DO NOT refactor existing PianobarService internals** — only add AudioBroker integration at the start/stop boundary
- **The WebSocket refactor may be the most complex part** — take time on the Phase 0 investigation before committing to an approach
- **`node-mpv` handles process management** — do NOT manually spawn/kill mpv processes. Use the library's `.load()`, `.stop()`, `.quit()` methods
- **yt-dlp search can fail** — handle timeouts (5 second limit) and empty results gracefully
- **The title parser doesn't need to be perfect** — it's a convenience pre-fill. The user always has the final say via the modal
- **Test volume normalization early** — play a quiet lofi stream followed by a loud track and verify `--af=loudnorm` is working. This is a speaker safety issue.
- **~/Music/ is the single source of truth for the library** — no database, no index file. Just scan the directory. This keeps it dead simple and means files added/removed outside of Monty are automatically reflected.
- **The queue is in-memory only** — it resets on service restart. This is fine for v1.
