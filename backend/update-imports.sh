#!/bin/bash
# Script to update imports across the codebase

echo "Scanning files for direct service imports..."

# Find all JS files
JS_FILES=$(find /home/monty/monty/backend/src -name "*.js" | grep -v "node_modules" | grep -v "archive")

# Replace direct imports with serviceFactory
for FILE in $JS_FILES; do
  # Skip the serviceFactory itself
  if [[ "$FILE" == *"/serviceFactory.js"* ]]; then
    continue
  fi
  
  # Check for direct weatherService imports
  if grep -q "require.*weatherService.*)" "$FILE"; then
    echo "Updating weatherService import in $FILE"
    sed -i 's/const weatherService = require(.*)\/weatherService.*);/const { weatherService } = require(\1\/serviceFactory);/g' "$FILE"
  fi
  
  # Check for direct schedulerService imports
  if grep -q "require.*schedulerService.*)" "$FILE"; then
    echo "Updating schedulerService import in $FILE"
    sed -i 's/const schedulerService = require(.*)\/schedulerService.*);/const { schedulerService } = require(\1\/serviceFactory);/g' "$FILE"
  fi
done

echo "Import updates complete!"