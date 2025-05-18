# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monty is a comprehensive home automation system focusing on shade automation, weather display, temperature monitoring, and music playback. The application includes interfaces for:

- Dashboard with weather, shade status, and wake-up alarm
- Detailed shade controls organized by room and type
- Music player integration with Pandora via pianobar
- Weather and temperature display
- Home/Away scheduling

## Commands

### Development Commands

#### Frontend (React)
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server (on port 3000 by default)
npm start

# Run tests
npm test

# Build for production
npm run build

# Lint the code
npm run lint
```

#### Backend (Express)
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start server in development mode with hot reload
npm run dev

# Start server in production mode
npm start
```

### Shade Control

The shade control system uses a Python script that communicates with an Arduino controller:

```bash
# Control individual shades
python3 /home/monty/shades/control_shades.py u14  # Move shade 14 UP
python3 /home/monty/shades/control_shades.py d28  # Move shade 28 DOWN
python3 /home/monty/shades/control_shades.py s40  # STOP shade 40

# Control shade scenes
python3 /home/monty/shades/control_shades.py scene:main,u  # Move all main group shades UP
```

### Music Control (Pianobar)

```bash
# Start pianobar in background
nohup pianobar &

# Control pianobar via FIFO
echo "p" > ~/.config/pianobar/ctl  # Play/pause
echo "n" > ~/.config/pianobar/ctl  # Next song
echo "s" > ~/.config/pianobar/ctl  # List stations
echo "s 2" > ~/.config/pianobar/ctl  # Switch to station #2
```

## Architecture

### Frontend (React with Tailwind CSS)

- **Pages**:
  - `HomePage.js` - Dashboard with widgets for weather, shades, and wake-up time
  - `ShadesPage.js` - Controls for window shades with sub-pages for each room
  - `MusicPage.js` - Pandora player interface via pianobar
  - `WeatherPage.js` - Weather forecast and temperature data
  - `HomeAwayPage.js` - Home/Away status and scheduling

- **Components**:
  - `Navbar.js` - Navigation header with hamburger menu
  - `Footer.js` - Page footer
  - `ShadeControl.js` - Reusable component for shade controls

- **State Management**:
  - React Context API for application state
  - Local storage for user preferences

### Backend (Express)

- **API Routes**:
  - `/api/shades/control` - Individual shade control
  - `/api/shades/scene` - Scene-based shade control
  - `/api/music/status` - Current music playback status
  - `/api/music/control` - Music control commands
  - `/api/weather` - Weather data
  - `/api/config` - Configuration management
  - `/api/away-schedule` - Home/Away scheduling

- **Services**:
  - Shade Service - Integrates with Python shade controller
  - Music Service - Manages pianobar via FIFO
  - Weather Service - OpenWeatherMap API integration
  - Scheduler Service - Handles timed events based on sunset data
  - Config Service - Manages application configuration

- **Dependencies**:
  - Express for the web server
  - node-cron for scheduled tasks
  - node-schedule for more complex scheduling
  - Winston for logging

### Shade Automation

The system includes several shade automation scenes:

- **Good Morning** - Raises main floor privacy shades at wake-up time
- **Good Afternoon** - Lowers solar shades to block sun
- **Good Evening** - Raises solar shades to show sunset
- **Good Night** - Lowers privacy shades after sunset
- **Rise'n'Shine** - Raises bedroom blackout shades at wake-up time

### Database and Configuration

- `shades.db` - SQLite database with shade configuration
- `config.json` - Application settings
- `sunset_data.csv` - Sunset timing data for scheduling

## Project Structure

```
/monty/
├── frontend/        # React frontend application
├── backend/         # Express backend server
├── docs/            # Project documentation
├── config/          # Configuration files
├── data/            # Data files (shades.db, sunset_data.csv)
├── CLAUDE.md        # This file
└── CLAUDE_CODE_README.md  # Initial guidance for Claude Code
```

## Development Workflow

1. Start by understanding the shade automation requirements in `docs/Read 1st - Monty Summary.md`
2. Review technical decisions in `docs/Read 2nd - Addressing Claude's comments.md`
3. Follow the development roadmap in `docs/Read 3rd - Post initial Setup - Next steps.md`
4. For shade control integration, refer to the implementation in `/home/monty/shades/`

## Shade Controller Details

The shade controller system consists of:

1. Arduino with FS1000A 433MHz RF transmitter (connected via USB)
2. Python interface (`control_shades.py`) for sending commands
3. SQLite database (`shades.db`) for shade configuration

Shades are organized by:
- Room (Main Level, Bedroom, Office, Loft)
- Type (Solar/Privacy/Blackout)
- Individual ID numbers for precise control

## Implementation Notes

- The application runs on an Ubuntu Server with the Arduino connected via USB
- Authentication is handled by network isolation (local WiFi only)
- Pianobar requires special handling for Bluetooth speaker connection
- Application should be resilient to restarts and gracefully recover state
- Use node-cron for scheduling based on sunset data