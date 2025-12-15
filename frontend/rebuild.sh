#!/bin/bash
# Frontend rebuild script
# Rebuilds the React production bundle

cd "$(dirname "$0")"

echo "🔨 Building frontend..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Frontend build complete!"
else
    echo "❌ Build failed!"
    exit 1
fi
