# Monty Application Troubleshooting Guide

This guide explains the common issues with the Monty application and how to fix them. Use this along with the `monty-restart.sh` script when you encounter problems.

## Common Issues and Fixes

### 1. Backend and Frontend Connection Issues

**Symptoms:**
- "Could not load shade configuration. Please check your connection" error
- API requests failing in browser console
- Blank pages or loading spinners that never resolve

**Root Causes:**
- **Port Mismatch**: Backend running on wrong port (should be 3001)
- **CORS Configuration**: Frontend can't access backend due to CORS restrictions
- **Environment Variables**: Incorrect API URL in frontend configuration
- **Process Issues**: Old Node.js processes blocking ports

**Solution:**
```bash
# Run the consolidated restart script
cd /home/monty/monty
./monty-restart.sh
```

### 2. Backend Fails to Start

**Symptoms:**
- Backend process exits immediately
- Error messages in logs about syntax or dependencies
- Port 3001 stays unoccupied

**Root Causes:**
- **Route Syntax Errors**: Particularly in config.js (invalid '/:path(*)' syntax)
- **Missing Dependencies**: Particularly 'axios' for weather functionality
- **Environment Configuration**: Incorrect settings in .env file

**Fixing Manually:**
1. Check for route syntax errors:
   ```bash
   cd /home/monty/monty/backend
   grep -r "/:path(\*)" src/
   ```
   Change any instances of '/:path(*)' to '/:path'

2. Install any missing dependencies:
   ```bash
   cd /home/monty/monty/backend
   npm install axios
   npm install
   ```

3. Verify environment configuration:
   ```bash
   cat /home/monty/monty/backend/.env
   ```
   Ensure PORT=3001 and HOST=0.0.0.0

### 3. Music Page Issues

After modifying the music page, you may have introduced one of these issues:

- **New API Routes**: Any new endpoints need proper implementation
- **Changed Dependencies**: New features might require additional packages
- **Modified Connection Logic**: Changes to how frontend connects to backend

If you modified the music page code:
1. Check what files you changed
2. Look for API endpoints or connection logic
3. Ensure all new dependencies are installed

## Diagnosing Problems

### Check Logs

**Backend Logs:**
```bash
tail -f /home/monty/monty/backend/logs/startup.log
```

**Frontend Logs:**
```bash
tail -f /home/monty/monty/frontend/logs/frontend.log
```

### Test API Connectivity

1. **Direct API test:**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Browser test:** 
   - Open http://localhost:3000/test-api.html
   - Check browser console (F12)

### Process Management

**See what's running:**
```bash
ps aux | grep node
```

**Check what's using the ports:**
```bash
lsof -i :3000
lsof -i :3001
```

## Maintaining a Clean Environment

1. **Always use the provided scripts** to start/stop services
2. **Check logs immediately** when errors occur
3. **Kill orphaned processes** before restarting

## Development Best Practices

1. **Make incremental changes** and test after each change
2. **Document API changes** immediately
3. **Keep dependency lists updated**
4. **Test cross-origin requests** when changing API endpoints

## When All Else Fails

If the standard fixes don't work:

1. Try the minimal server approach:
   ```bash
   cd /home/monty/monty/backend
   node minimal-server.js
   ```

2. Reinstall all dependencies from scratch:
   ```bash
   cd /home/monty/monty/backend
   rm -rf node_modules
   npm install
   
   cd /home/monty/monty/frontend
   rm -rf node_modules
   npm install
   ```

3. Check for system-level issues:
   ```bash
   # Check disk space
   df -h
   
   # Check memory
   free -m
   
   # Check nodejs version
   node --version
   ```
