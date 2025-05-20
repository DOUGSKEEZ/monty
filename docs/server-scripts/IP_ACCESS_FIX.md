# IP Address Access Fix for Monty Application

## Problem Identified

The application was experiencing connection issues when accessed via IP address (192.168.0.15) because:

1. The backend server was only listening on localhost (127.0.0.1)
2. The frontend was using a relative API URL that works only when accessed via localhost
3. CORS settings needed to be updated to allow cross-origin requests from other origins

## Changes Made

### Server Configuration

1. **Backend Server Listening**
   - Changed server to listen on all interfaces (0.0.0.0)
   - Now accessible via both localhost and IP address

2. **Frontend API URL**
   - Updated to dynamically use appropriate URL based on access method
   - When accessed via localhost: Uses relative URL with proxy
   - When accessed via IP: Uses full URL with IP address

3. **CORS Configuration**
   - Configured to allow requests from any origin during development
   - Added proper headers and methods configuration

4. **Environment Variables**
   - Added .env.local file with the correct IP address
   - Ensured backend runs on port 3001 as expected by frontend

## Diagnostic Tools Added

1. **API Test Page**
   - Added `/test-api.html` for testing API connectivity
   - Helps diagnose connection issues quickly

2. **Network Diagnostics Script**
   - Added a network-debug.sh script
   - Provides detailed network information
   - Tests API connectivity from different methods
   - Shows recommendations for fixing issues

3. **Enhanced Restart Script**
   - Shows both local and network URLs
   - Automatically configures frontend with correct IP
   - Provides more debug information

## How to Use

1. **Run the Updated Restart Script**
   ```bash
   /home/monty/monty/restart.sh
   ```
   This will start both servers with the correct configuration.

2. **Access Via IP Address**
   - Frontend: http://192.168.0.15:3000
   - API: http://192.168.0.15:3001/api
   - Test Page: http://192.168.0.15:3000/test-api.html

3. **If Issues Persist**
   Run the network diagnostics:
   ```bash
   /home/monty/monty/network-debug.sh
   ```
   This will provide detailed information about your network setup and recommendations.

## Technical Details

### Key Files Modified

1. **Backend Server (server.js)**
   - Changed listen() call to use 0.0.0.0 address
   - Updated CORS configuration for broader access

2. **Frontend API Utility (api.js)**
   - Added dynamic API URL selection based on hostname
   - Added better error logging

3. **Environment Configuration**
   - Added .env.local with dynamic IP address
   - Ensured consistent port usage

This solution ensures the application works regardless of how you access it - via localhost or IP address.