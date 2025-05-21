# Monty Setup Guide

This guide provides instructions for setting up the Monty home automation system.

## Prerequisites

- Ubuntu Server (18.04 LTS or newer)
- Node.js (v14.x or newer)
- NPM (v6.x or newer)
- Python 3.6+
- SQLite3
- Arduino connected via USB (for shade control)
- Bluetooth support (for music playback)
- Pandora account (for music service)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/monty.git
cd monty
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy and configure the sample config
cp config.sample.json config.json
```

Edit `config.json` to add your:
- OpenWeatherMap API key
- Location settings
- Hardware configuration

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install

# Build for production
npm run build
```

### 4. Database Setup

```bash
# Navigate to data directory
cd ../data

# Initialize database
sqlite3 shades.db < ../docs/shades_files/schema.sql
```

### 5. Shade Controller Setup

```bash
# Connect Arduino to USB port
# Upload the shade_transmitter sketch to Arduino

# Test shade control
python3 backend/src/services/shades/control_shades.py test
```

### 6. Set Up Bluetooth Audio (Optional)

```bash
# Install Bluetooth tools
sudo apt install bluez bluez-tools pulseaudio-module-bluetooth

# Set up sudo access for Bluetooth
sudo cp config/bluetooth_sudoers /etc/sudoers.d/bluetooth
sudo chmod 440 /etc/sudoers.d/bluetooth

# Test Bluetooth connection
./config/setup-bluetooth-sudo.sh
```

### 7. Configure System Services

```bash
# Install service files
sudo cp config/monty-backend.service /etc/systemd/system/
sudo cp config/monty-frontend.service /etc/systemd/system/

# Update service paths if needed
sudo nano /etc/systemd/system/monty-backend.service
sudo nano /etc/systemd/system/monty-frontend.service

# Enable and start services
sudo systemctl enable monty-backend.service
sudo systemctl enable monty-frontend.service
sudo systemctl start monty-backend.service
sudo systemctl start monty-frontend.service
```

## Development Setup

For development, you can run the services with hot-reload:

```bash
# Backend development
cd backend
npm run dev

# Frontend development (in a separate terminal)
cd frontend
npm start
```

## Configuration Guide

### OpenWeatherMap API

1. Create an account at [OpenWeatherMap](https://openweathermap.org/)
2. Generate an API key
3. Add the key to `config.json` in the weather section

### Shade Configuration

1. Map your shade IDs using the `shades.db` database
2. Group shades by room and type for scene control
3. Test each shade with the control script

### Music Configuration

1. Set up pianobar with your Pandora credentials
2. Configure default stations in `config.json`
3. Connect and test Bluetooth speakers

## Troubleshooting

For common issues and solutions, see the [Troubleshooting Guide](../troubleshooting/README.md).

## Next Steps

- Set up your preferred wake-up and bedtime schedules
- Configure shade automation based on sunset times
- Customize music station presets
- Connect to your home network