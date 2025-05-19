#!/bin/bash

# Setup script for Monty Home Automation system services
# This script should be run as root or with sudo

# Exit on error
set -e

echo "Setting up Monty Home Automation system services..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

# Ensure serve is installed for frontend
if ! command -v serve &> /dev/null; then
  echo "Installing serve package globally..."
  npm install -g serve
fi

# First, check if the frontend build exists
if [ ! -d "/home/monty/monty/frontend/build" ]; then
  echo "Frontend build directory not found. Building frontend..."
  
  # Change directory and create production build
  cd /home/monty/monty/frontend
  su -c "npm run build" monty
  
  if [ ! -d "/home/monty/monty/frontend/build" ]; then
    echo "Failed to create frontend build. Exiting."
    exit 1
  fi
fi

# Copy service files
echo "Installing systemd service files..."
cp /home/monty/monty/config/monty-backend.service /etc/systemd/system/
cp /home/monty/monty/config/monty-frontend.service /etc/systemd/system/

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Enable services
echo "Enabling services to start at boot..."
systemctl enable monty-backend.service
systemctl enable monty-frontend.service

# Start services
echo "Starting services..."
systemctl start monty-backend.service
systemctl start monty-frontend.service

# Check status
echo "Checking service status..."
systemctl status monty-backend.service --no-pager
systemctl status monty-frontend.service --no-pager

echo ""
echo "Services have been set up successfully!"
echo "You can access the application at http://localhost:3000"
echo ""
echo "To check logs:"
echo "  sudo journalctl -u monty-backend.service"
echo "  sudo journalctl -u monty-frontend.service"
echo ""