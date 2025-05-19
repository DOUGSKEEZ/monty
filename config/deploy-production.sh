#!/bin/bash

# Production deployment script for Monty Home Automation
# This script builds and deploys the application for production use

# Exit on error
set -e

echo "Starting deployment of Monty Home Automation..."
cd /home/monty/monty

# Stop services if they're running
echo "Stopping existing services (if running)..."
sudo systemctl stop monty-frontend.service || true
sudo systemctl stop monty-backend.service || true

# Copy production environment files
echo "Setting up production environment..."
cp /home/monty/monty/backend/.env.production /home/monty/monty/backend/.env
cp /home/monty/monty/frontend/.env.production /home/monty/monty/frontend/.env

# Install dependencies
echo "Installing backend dependencies..."
cd /home/monty/monty/backend
npm ci

echo "Installing frontend dependencies..."
cd /home/monty/monty/frontend
npm ci

# Build frontend
echo "Building frontend..."
npm run build

# Copy service files
echo "Installing systemd service files..."
sudo cp /home/monty/monty/config/monty-backend.service /etc/systemd/system/
sudo cp /home/monty/monty/config/monty-frontend.service /etc/systemd/system/

# Reload systemd
echo "Reloading systemd..."
sudo systemctl daemon-reload

# Start and enable services
echo "Starting and enabling services..."
sudo systemctl enable monty-backend.service
sudo systemctl enable monty-frontend.service
sudo systemctl start monty-backend.service
sudo systemctl start monty-frontend.service

# Check service status
echo "Checking service status..."
sudo systemctl status monty-backend.service --no-pager
sudo systemctl status monty-frontend.service --no-pager

echo ""
echo "Deployment completed successfully!"
echo "Application is now running in production mode."
echo "You can access it at: http://localhost:3000"
echo ""