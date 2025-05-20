#!/bin/bash

# Script to install Bluetooth sudoers configuration without password prompts

CONFIG_FILE="/home/monty/monty/config/bluetooth_sudoers"
DEST_FILE="/etc/sudoers.d/bluetooth"

echo "Installing Bluetooth sudoers configuration..."

# Check if running as root
if [ "$(id -u)" -eq 0 ]; then
    # Already running as root, proceed with direct installation
    cp "$CONFIG_FILE" "$DEST_FILE" && chmod 440 "$DEST_FILE"
    if [ $? -eq 0 ]; then
        echo "Success! Bluetooth sudoers configuration installed."
        exit 0
    else
        echo "ERROR: Failed to install sudoers configuration."
        exit 1
    fi
else
    echo "This script requires elevated privileges."
    echo "Please run with sudo: sudo bash $(basename "$0")"
    exit 1
fi