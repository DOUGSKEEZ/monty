# Emergency Fix Instructions

Based on the diagnostics, we've identified critical issues preventing the application from connecting properly:

1. **The backend server is not running or not accessible from the IP address**
2. **The frontend API URL configuration is not correctly pointing to the backend**

## Step 1: Run Emergency Restart Script

```bash
/home/monty/monty/emergency-restart.sh
```

This script will:
- Kill all existing Node.js processes
- Update configuration files with correct settings
- Start the backend server in the background
- Verify the backend is running

## Step 2: Start the Frontend

```bash
cd /home/monty/monty/frontend
npm start
```

## Step 3: Verify Connectivity

1. **Test the backend directly:**
   ```bash
   curl http://192.168.0.15:3001/api/health
   ```
   This should return a JSON response.

2. **Test via the test page:**
   - Open the file `/home/monty/monty/test-api-direct.html` in a browser
   - Or navigate to http://192.168.0.15:3000/test-api.html when frontend is running

## Step 4: Access the Application

Open http://192.168.0.15:3000 in your browser.

## Troubleshooting

If you still encounter issues:

### Check Backend Logs

```bash
tail -f /home/monty/monty/backend/logs/stderr.log
```

### Check Frontend Console

1. Open browser developer tools (F12)
2. Look at the Console tab for error messages

### Direct API URL for Frontend

If connectivity still fails, you can manually open the file:
```bash
nano /home/monty/monty/frontend/src/utils/api.js
```

And update to use a hardcoded API URL:
```javascript
const API_BASE_URL = 'http://192.168.0.15:3001/api';
```

### Firewall Issues

If you suspect firewall issues:
```bash
sudo ufw status
```

You may need to allow ports 3000 and 3001:
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
```

## For Ongoing Issues

Create a simple test file in the backend directory:
```bash
cd /home/monty/monty/backend
echo "console.log('Server test script running...');" > test.js
node test.js
```

If this runs without error, your Node.js installation is working correctly.