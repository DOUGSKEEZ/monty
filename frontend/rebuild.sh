#!/bin/bash
# Frontend rebuild script
# Rebuilds the React production bundle

cd "$(dirname "$0")"

echo "🔨 Building frontend..."
npm run build

if [ $? -eq 0 ]; then
    # Ensure all static assets are world-readable/traversable.
    # Guards against source dirs with restrictive perms (e.g. 0700) being
    # copied into build/ and becoming unservable by the backend (user: monty).
    chmod -R a+rX build
    echo "✅ Frontend build complete!"
else
    echo "❌ Build failed!"
    exit 1
fi
