# API Connection Debugging Guide

## Problem

The frontend applications (Home, Shades, Music, Weather pages) are showing connection errors:
```
Could not load shade configuration. Please check your connection.
```

These errors indicate that the frontend is unable to connect to the backend API.

## Fixes Applied

1. **Environment Variables**
   - Created `.env.development` with correct API URL
   - Updated backend to listen on port 3001

2. **CORS Configuration**
   - Updated backend to allow all origins during development
   - Ensured proper headers and methods are allowed

3. **Debugging Tools**
   - Added console logging to API requests
   - Created a test HTML page to validate API connectivity

## Testing API Connectivity

1. **Use the Test Page**
   - Navigate to: http://localhost:3000/test-api.html
   - This page will help diagnose API connection issues
   - Test the health, shades, and weather endpoints

2. **Check Console Logs**
   - Open browser developer tools (F12)
   - Look for log messages about API requests
   - Note any errors in the console

3. **Verify Backend is Running**
   - Make sure the backend server is running on port 3001
   - Check the backend console for any error messages

## IP Address vs. Localhost

If you're accessing the frontend via IP address (http://192.168.0.15:3000) but the backend is running on localhost, you might experience connectivity issues.

Solutions:
1. **Run Backend on 0.0.0.0**
   - Edit `/home/monty/monty/backend/.env` to add: `HOST=0.0.0.0`
   - This makes the backend listen on all network interfaces

2. **Use Frontend Proxy**
   - Add a proxy setting in `package.json`: `"proxy": "http://localhost:3001"`
   - This allows relative API URLs that will be proxied correctly

3. **Use Same Domain**
   - Access frontend via localhost instead of IP address

## Manual API Testing

Test the API directly using curl:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/shades/config
```

## Network Configuration

If you're running in a Docker container or VM, ensure:
1. Port forwarding is properly configured
2. Network mode allows communication between containers/services
3. Firewall settings allow the connections

## Next Steps

After fixing the connection issue:
1. Restart both frontend and backend servers
2. Clear browser cache (Ctrl+F5 or Command+Shift+R)
3. Try accessing the application again