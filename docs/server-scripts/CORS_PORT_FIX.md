# Backend Port and CORS Configuration Fix

## Issues Fixed

1. **Port Mismatch**
   - The backend was configured to run on port 4000 in the example environment file
   - The frontend API utility was expecting the backend to be on port 3001
   - Fixed by creating a proper `.env` file with PORT=3001

2. **CORS Configuration**
   - Added explicit CORS configuration in the server.js file
   - Allowed origins include localhost:3000, 127.0.0.1:3000, and 192.168.0.15:3000
   - Specified allowed methods and headers

## Testing the Fix

1. Restart both backend and frontend servers:

   **Backend:**
   ```bash
   cd /home/monty/monty/backend
   npm run dev
   ```

   **Frontend:**
   ```bash
   cd /home/monty/monty/frontend
   npm start
   ```

2. The backend should now start on port 3001 with the message:
   ```
   Server running on port 3001
   ```

3. Navigate to the Shades page in the frontend:
   - The error message "Could not load shade configuration" should no longer appear
   - The UI should show the complete shade organization structure

## Browser Console Debugging

If you still encounter issues:

1. Open your browser's Developer Tools (F12 or right-click > Inspect)
2. Go to the Console tab
3. Look for any error messages related to API requests or CORS
4. Check the Network tab to see if the request to `/api/shades/config` is:
   - Being sent to the correct URL (http://localhost:3001/api/shades/config)
   - Receiving a 200 OK response with the expected data

## Server Response Debugging

In the backend console, you should see log messages like:

```
[INFO] HTTP GET /api/shades/config 200
```

If you see a 404 status or other error codes, there might still be an issue with the route configuration.

## Manual API Testing

You can test the API directly using curl:

```bash
curl http://localhost:3001/api/shades/config
```

This should return a JSON response with the shade configuration data.

## Frontend Environment

If needed, you can create a `.env.development` file in the frontend directory to explicitly set the API URL:

```
REACT_APP_API_BASE_URL=http://localhost:3001/api
```

Remember to restart the frontend after creating or modifying this file.