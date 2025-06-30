# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monty is a comprehensive home automation system focusing on shade automation, weather display, temperature monitoring, and music playback. The system has evolved into a distributed architecture with robust monitoring and self-healing capabilities.

The application includes interfaces for:

- Dashboard with weather, shade status, and wake-up alarm
- Detailed shade controls organized by room and type
- Music player integration with Pandora via pianobar (V3 implementation with WebSocket real-time updates)
- Weather and temperature display
- Home/Away scheduling
- Comprehensive monitoring and metrics via Prometheus/Splunk Cloud
- Dedicated FastAPI microservice for shade control (ShadeCommander)

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

# Start server in development mode with hot reload and monitoring
npm run dev  # Uses nodemon with New Relic monitoring enabled

# Start with Prometheus metrics enabled
./start-with-metrics.sh

# Start server in production mode
npm start

# Lint the code
npm run lint

# Kill backend server
./kill-server.sh
```

#### ShadeCommander (FastAPI Microservice)
```bash
# Navigate to shades commander directory
cd shades/commander

# Install Python dependencies
pip install -r requirements.txt

# Start ShadeCommander service (runs on port 8000)
./start-shadecommander.sh

# Stop ShadeCommander service
./kill-shadecommander.sh

# Test service functionality
python main.test.py
```

### Shade Control

The shade control system now uses a dedicated FastAPI microservice (ShadeCommander) for improved reliability and performance:

```bash
# Via ShadeCommander REST API (preferred method)
curl -X POST http://192.168.0.15:8000/shades/14/up    # Move shade 14 UP
curl -X POST http://192.168.0.15:8000/shades/28/down  # Move shade 28 DOWN
curl -X POST http://192.168.0.15:8000/shades/40/stop  # STOP shade 40

# Scene control via API
curl -X POST http://192.168.0.15:8000/scenes/good_morning/execute

# Legacy Python script (still available)
python3 /home/monty/shades/control_shades.py u14  # Move shade 14 UP
python3 /home/monty/shades/control_shades.py scene:main,u  # Move all main group shades UP

# Kill zombie shade processes (emergency cleanup)
curl -X DELETE http://192.168.0.15:8000/shades/kill-zombies
```

### Music Control (Pianobar V3)

The music system now includes WebSocket real-time updates and Bluetooth integration:

```bash
# Pianobar V3 with WebSocket support (managed by backend)
# Real-time updates via WebSocket on ws://192.168.0.15:3001/pianobar

# Control via backend API (preferred method)
curl -X POST http://192.168.0.15:3001/api/music/play-pause
curl -X POST http://192.168.0.15:3001/api/music/next
curl -X POST http://192.168.0.15:3001/api/music/station -d '{"stationId": "2"}'

# Bluetooth speaker management
curl -X POST http://192.168.0.15:3001/api/bluetooth/connect
curl -X POST http://192.168.0.15:3001/api/bluetooth/disconnect

# Legacy FIFO control (still available)
echo "p" > ~/.config/pianobar/ctl  # Play/pause
echo "n" > ~/.config/pianobar/ctl  # Next song
echo "s 2" > ~/.config/pianobar/ctl  # Switch to station #2
```

### Monitoring and Metrics

```bash
# Prometheus metrics endpoint
curl http://192.168.0.15:3001/metrics

# New Relic monitoring (configured in backend)
# Splunk Cloud logging (configured with HEC transport)

# Test monitoring setup
cd backend && ./test-monitoring.sh

# Toggle monitoring on/off
cd backend && ./toggle-monitoring.sh
```

## Architecture

### System Overview
Monty now uses a distributed microservice architecture with comprehensive monitoring:

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ React Frontend  │────▶│ Express Backend │────▶│ ShadeCommander   │
│ (Port 3000)     │     │ (Port 3001)     │     │ (Port 8000)      │
└─────────────────┘     └─────────────────┘     └──────────────────┘
         │                        │                        │
         │                        ▼                        ▼
         │               ┌─────────────────┐     ┌──────────────────┐
         │               │ Pianobar V3     │     │ Arduino/RF       │
         │               │ (WebSocket)     │     │ Shade Control    │
         │               └─────────────────┘     └──────────────────┘
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Prometheus      │◀────│ New Relic       │◀────│ Splunk Cloud     │
│ Metrics         │     │ Monitoring      │     │ Logging          │
└─────────────────┘     └─────────────────┘     └──────────────────┘
```

### Frontend (React with Tailwind CSS)

- **Pages**:
  - `HomePage.js` - Dashboard with widgets for weather, shades, and wake-up time
  - `ShadesPage.js` - Controls for window shades with sub-pages for each room
  - `PianobarPage.js` - Pianobar V3 interface with WebSocket real-time updates and Bluetooth controls
  - `WeatherPage.js` - Weather forecast and temperature data with map integration
  - `SettingsPage.js` - System configuration and away scheduling

- **Components**:
  - `Navbar.js` - Navigation header with hamburger menu
  - `Footer.js` - Page footer
  - `ShadeControl.js` - Reusable component for shade controls
  - `WeatherMap.js` - Leaflet map integration for weather visualization
  - `AwayManager.js` - Away period scheduling components

- **State Management**:
  - React Context API for application state
  - Local storage for user preferences
  - WebSocket connections for real-time updates

### Backend (Express)

- **API Routes**:
  - `/api/music/*` - Pianobar V3 control and status
  - `/api/bluetooth/*` - Bluetooth speaker management
  - `/api/weather` - Weather data with caching and quota management
  - `/api/config` - Configuration management
  - `/api/scheduler/*` - Automated scheduling system
  - `/api/state` - Application state management
  - `/metrics` - Prometheus metrics endpoint
  - `/api/monitoring/*` - System monitoring and health checks

- **Services** (Dependency Injection Architecture):
  - **PianobarService** - Process lifecycle management with circuit breaker patterns
  - **PianobarWebsocketService** - Real-time updates via WebSocket
  - **BluetoothService** - Bluetooth speaker connection management
  - **WeatherService** - OpenWeatherMap integration with quota tracking and caching
  - **SchedulerService** - Handles timed events with timezone management
  - **PrometheusMetricsService** - Comprehensive system and application metrics
  - **MultiVendorMetricsService** - Support for multiple monitoring platforms

- **Infrastructure**:
  - **ServiceRegistry** - Centralized service management with health monitoring
  - **CircuitBreaker** - Fault tolerance for external dependencies
  - **RetryHelper** - Configurable retry logic with exponential backoff
  - **ServiceWatchdog** - Self-healing capabilities for failed services
  - **TimezoneManager** - Robust timezone handling for scheduling

- **Dependencies**:
  - Express 5.x for the web server
  - Winston with Splunk HEC transport for structured logging
  - Prometheus client for metrics collection
  - New Relic for APM monitoring
  - WebSocket (ws) for real-time communication
  - Serialport for Arduino communication
  - node-cron and node-schedule for scheduling

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

## Working with Assumptions

When making technical decisions or analyzing system behavior:

- **Always be transparent about assumptions**: State clearly when you're making an assumption vs citing facts from code
- **Explain why assumptions matter**: Connect assumptions to their impact on the decision at hand
- **Check code first for critical details**: For timing, behavior, or configuration details that affect system design, verify against actual implementation
- **Use qualifying language**: "I'm assuming X for now, but let me check..." or "Based on standard patterns, I expect Y, but this should be verified..."

**Example of good assumption handling:**
> "I'm assuming a standard exponential backoff pattern of 2s/4s/8s for retry delays, but let me check the actual ShadeCommander configuration since this directly impacts our zombie detection thresholds..."

Assumptions aren't bad - they help explore possibilities and catch missing considerations. But transparency prevents small cracks from becoming big bugs as we iterate.

## SchedulerService Development Guidelines

The SchedulerService (`backend/src/services/SchedulerService.js`) has grown into a large, complex file with mixed concerns. When working with this service:

### Principles for Changes
- **Minimal, targeted fixes**: Prefer simple, one-line solutions over comprehensive defensive programming
- **Avoid code bloat**: The file is already massive (~1700+ lines) with redundant patterns and mixed concerns
- **Question complexity**: If a solution seems complex, step back and find a simpler approach
- **Understand before adding**: Study existing patterns before introducing new ones

### Known Issues
- **Mixed responsibilities**: Scheduling, scene execution, music control, Bluetooth management, timezone handling, validation
- **Redundant code patterns**: Multiple ways of doing similar operations
- **Defensive programming overflow**: Too much validation and error handling that obscures core logic
- **Complex timezone handling**: Scattered throughout with inconsistent approaches

### Future Refactoring Opportunities
The service could benefit from being split into focused services:
- SceneExecutor - Handle scene execution and music integration
- TimeCalculator - Manage scene time calculations and timezone logic
- ScheduleManager - Handle cron job scheduling and management
- ValidationService - Centralized validation logic

### Example of Good Practice
Recent fix for "Next Scene" display issue: Added single line `this.calculateSceneTimes().catch(() => {});` after successful scene execution instead of complex defensive programming and validation layers.

## Communication and Collaboration Style

This project values thoughtful, courteous communication that helps both parties grow:

- **Acknowledge mistakes with apologies**: When making errors or incorrect assumptions, begin with "I'm sorry" or "My apologies" before explaining. This shows respect for time and effort.
- **Practice politeness**: Use courteous language and decorum. The "guilded details of conversation" matter for building a positive working relationship.
- **Mutual growth mindset**: Both parties should strive to raise each other up through respectful communication and proper etiquette with absolute honesty.

The goal is to be both a technical tool and a collaborative partner that helps improve communication style, manners, and expertise.