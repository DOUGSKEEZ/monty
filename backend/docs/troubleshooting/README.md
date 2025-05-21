# Monty Troubleshooting Guide

This guide provides solutions for common issues that may occur with the Monty home automation system.

## System-Wide Issues

### Service Won't Start

**Symptoms:**
- Services fail to start
- `systemctl status monty-backend.service` shows errors

**Solutions:**
1. Check logs: `journalctl -u monty-backend.service`
2. Verify permissions: `ls -la /home/monty/monty`
3. Check config file: `cat /home/monty/monty/config/config.json`
4. Restart service: `sudo systemctl restart monty-backend.service`

### Network Connectivity Issues

**Symptoms:**
- Frontend can't connect to backend API
- "Failed to fetch" errors in browser console

**Solutions:**
1. Verify backend is running: `systemctl status monty-backend.service`
2. Check correct ports are open: `sudo netstat -tulpn | grep node`
3. Verify CORS configuration in `backend/src/server.js`
4. Run the network diagnostic script: `./server-scripts/network-debug.sh`

## Weather Service Issues

### Weather Data Not Updating

**Symptoms:**
- Weather widget shows old data
- "Last updated" timestamp is stale

**Solutions:**
1. Check API key in config: `cat /home/monty/monty/config/config.json`
2. Verify network connectivity to OpenWeatherMap API
3. Check cache file: `cat /home/monty/monty/data/cache/weather_cache.json`
4. Restart weather service: `curl -X POST http://localhost:3001/api/weather/refresh`

### Location Not Found

**Symptoms:**
- "Location not found" error
- Weather displays defaults or placeholders

**Solutions:**
1. Verify location coordinates in config
2. Try using city name instead of coordinates
3. Check API key has proper permissions

## Shade Control Issues

### Shades Not Responding

**Symptoms:**
- Commands sent but shades don't move
- Error messages about controller connection

**Solutions:**
1. Check Arduino connection: `ls -l /dev/ttyACM*` or `ls -l /dev/ttyUSB*`
2. Verify permissions: `sudo chmod a+rw /dev/ttyACM0`
3. Test direct command: `python3 /home/monty/monty/backend/src/services/shades/control_shades.py test`
4. Check shade database: `sqlite3 /home/monty/monty/data/shades.db 'SELECT * FROM shades;'`

### Scene Execution Failures

**Symptoms:**
- Some shades in a scene work, others don't
- Scene appears to execute but nothing happens

**Solutions:**
1. Verify scene configuration: `sqlite3 /home/monty/monty/data/shades.db 'SELECT * FROM scenes;'`
2. Test individual shades: `python3 /home/monty/monty/backend/src/services/shades/control_shades.py u14`
3. Check RF transmitter connection and placement
4. Verify shade IDs match your physical installation

## Music Service Issues

### Bluetooth Connection Failures

**Symptoms:**
- Cannot connect to Bluetooth speakers
- "Connection failed" errors

**Solutions:**
1. Check Bluetooth service: `systemctl status bluetooth`
2. Verify speaker is in pairing mode
3. Run Bluetooth connection script manually: `sudo /home/monty/monty/backend/src/services/bt-connect.sh connect "Speaker Name"`
4. Check Bluetooth permissions: `ls -la /etc/sudoers.d/bluetooth`

### Pianobar Not Starting

**Symptoms:**
- Music controls don't work
- "Pianobar not running" errors

**Solutions:**
1. Check if pianobar is running: `ps aux | grep pianobar`
2. Start pianobar manually: `nohup pianobar &`
3. Check Pandora credentials: `cat ~/.config/pianobar/config`
4. Verify control FIFO: `ls -la ~/.config/pianobar/ctl`

### Music Playback Issues

**Symptoms:**
- Music plays but controls don't work
- Song information not updating

**Solutions:**
1. Restart pianobar: `pkill pianobar && nohup pianobar &`
2. Check FIFO permissions: `chmod 666 ~/.config/pianobar/ctl`
3. Verify cache files: `ls -la /home/monty/monty/data/cache/pianobar_*`
4. Test direct control: `echo 'p' > ~/.config/pianobar/ctl`

## Scheduler Issues

### Scheduled Events Not Running

**Symptoms:**
- Automated events don't execute at scheduled times
- Schedule appears correct but nothing happens

**Solutions:**
1. Check system time: `date`
2. Verify schedule configuration: `curl http://localhost:3001/api/scheduler/schedule`
3. Check scheduler service status: `curl http://localhost:3001/api/scheduler/status`
4. Look for errors in logs: `tail -100 /home/monty/monty/logs/monty.log | grep scheduler`

### Sunset-Based Events Incorrect

**Symptoms:**
- Events happen at wrong times relative to sunset
- Sunset data appears incorrect

**Solutions:**
1. Verify location settings in config
2. Check sunset data file: `cat /home/monty/monty/data/sunset_data.csv`
3. Manually verify sunset time for your location
4. Restart scheduler service: `curl -X POST http://localhost:3001/api/scheduler/restart`

## Frontend Issues

### Page Not Loading

**Symptoms:**
- Blank page when accessing the frontend
- JavaScript console errors

**Solutions:**
1. Check if frontend service is running: `systemctl status monty-frontend.service`
2. Verify build files exist: `ls -la /home/monty/monty/frontend/build`
3. Check for JavaScript errors in browser console
4. Rebuild frontend: `cd /home/monty/monty/frontend && npm run build`

### API Connection Errors

**Symptoms:**
- UI loads but shows "Cannot connect to API" messages
- Data panels show error states

**Solutions:**
1. Verify backend is running: `curl http://localhost:3001/api/health`
2. Check API URL configuration in frontend
3. Verify CORS settings in backend
4. Restart both services: `sudo systemctl restart monty-backend.service monty-frontend.service`

## Emergency Recovery

For emergency situations when the system is completely unresponsive:

```bash
# Stop all services
sudo systemctl stop monty-backend.service monty-frontend.service

# Clean up any zombie processes
pkill -9 node
pkill -9 pianobar

# Clear cache files
rm -f /home/monty/monty/data/cache/*.json

# Restart services with clean state
sudo systemctl start monty-backend.service
sudo systemctl start monty-frontend.service
```

If the issue persists, you can run the emergency recovery script:

```bash
/home/monty/monty/server-scripts/emergency-restart.sh
```