# Monty Home Automation - System Services and Configuration

This directory contains systemd service configuration files, production configuration, and deployment scripts for running Monty Home Automation as system services that start automatically on boot.

## Backend Service Setup

To install the backend service:

1. Copy the service file to the systemd directory:
   ```bash
   sudo cp /home/monty/monty/config/monty-backend.service /etc/systemd/system/
   ```

2. Reload systemd:
   ```bash
   sudo systemctl daemon-reload
   ```

3. Enable the service to start on boot:
   ```bash
   sudo systemctl enable monty-backend.service
   ```

4. Start the service:
   ```bash
   sudo systemctl start monty-backend.service
   ```

5. Check the status:
   ```bash
   sudo systemctl status monty-backend.service
   ```

6. View logs:
   ```bash
   sudo journalctl -u monty-backend.service
   ```

## Frontend Service Setup

To install the frontend service:

1. Copy the service file to the systemd directory:
   ```bash
   sudo cp /home/monty/monty/config/monty-frontend.service /etc/systemd/system/
   ```

2. Reload systemd:
   ```bash
   sudo systemctl daemon-reload
   ```

3. Enable the service to start on boot:
   ```bash
   sudo systemctl enable monty-frontend.service
   ```

4. Start the service:
   ```bash
   sudo systemctl start monty-frontend.service
   ```

5. Check the status:
   ```bash
   sudo systemctl status monty-frontend.service
   ```

6. View logs:
   ```bash
   sudo journalctl -u monty-frontend.service
   ```

## Troubleshooting

If the services fail to start, check the following:

1. Ensure the specified user has permission to access the application directory
2. Verify that all dependencies are correctly installed
3. Check the system logs for errors:
   ```bash
   sudo journalctl -u monty-backend.service -n 100
   ```

## Production Deployment

For a full production deployment, this repository includes two scripts:

1. **setup-services.sh**: Sets up the systemd services for an existing application
   ```bash
   sudo /home/monty/monty/config/setup-services.sh
   ```

2. **deploy-production.sh**: Performs a complete production deployment including:
   - Setting up production environment files
   - Installing dependencies
   - Building the frontend
   - Setting up and starting the systemd services
   ```bash
   /home/monty/monty/config/deploy-production.sh
   ```

## Production Configuration

The `production.config.json` file contains production-specific settings that override the default configuration. This includes:

- Server configuration (port, log levels, etc.)
- Weather API refresh intervals
- Security settings
- CORS and rate limiting settings

Modify this file to match your production environment requirements.

## Service Management Quick Reference

- Start a service: `sudo systemctl start monty-backend.service`
- Stop a service: `sudo systemctl stop monty-backend.service`
- Restart a service: `sudo systemctl restart monty-backend.service`
- Enable a service at boot: `sudo systemctl enable monty-backend.service`
- Disable a service at boot: `sudo systemctl disable monty-backend.service`
- Check service status: `sudo systemctl status monty-backend.service`