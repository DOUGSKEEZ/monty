#!/bin/bash

# Generate app icons from montyicon.png
# This script creates the required icon sizes for PWA and favicon

echo "Generating app icons from montyicon.png..."

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick is required but not installed. Install with: sudo apt-get install imagemagick"
    exit 1
fi

# Navigate to the public directory
cd "$(dirname "$0")/public" || exit 1

# Check if source image exists
if [ ! -f "images/montyicon.png" ]; then
    echo "Error: images/montyicon.png not found!"
    exit 1
fi

# Generate PNG icons
echo "Creating logo192.png..."
convert images/montyicon.png -resize 192x192 logo192.png

echo "Creating logo512.png..."
convert images/montyicon.png -resize 512x512 logo512.png

# Generate multiple sizes for favicon
echo "Creating favicon sizes..."
convert images/montyicon.png -resize 16x16 favicon-16.png
convert images/montyicon.png -resize 32x32 favicon-32.png
convert images/montyicon.png -resize 48x48 favicon-48.png

# Create favicon.ico (requires all three sizes)
echo "Creating favicon.ico..."
convert favicon-16.png favicon-32.png favicon-48.png favicon.ico

# Clean up temporary files
rm favicon-16.png favicon-32.png favicon-48.png

echo "Icon generation complete!"
echo ""
echo "Generated files:"
echo "  - logo192.png (for PWA)"
echo "  - logo512.png (for PWA splash screen)"
echo "  - favicon.ico (for browser tab)"
echo ""
echo "The app will use these icons after you restart the development server."