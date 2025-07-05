#!/bin/bash

# Generate app icons from custom icon files
# This script uses pre-sized icon files for PWA and favicon

echo "Copying custom icon files..."

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick is required but not installed. Install with: sudo apt-get install imagemagick"
    exit 1
fi

# Navigate to the public directory
cd "$(dirname "$0")/public" || exit 1

# Check if source images exist
if [ ! -f "images/Monty_Bowtie_Favicon.png" ]; then
    echo "Error: images/Monty_Bowtie_Favicon.png not found!"
    exit 1
fi

if [ ! -f "images/Monty192.png" ]; then
    echo "Error: images/Monty192.png not found!"
    exit 1
fi

if [ ! -f "images/Monty512.png" ]; then
    echo "Error: images/Monty512.png not found!"
    exit 1
fi

# Copy pre-sized PNG icons
echo "Copying logo192.png..."
cp images/Monty192.png logo192.png

echo "Copying logo512.png..."
cp images/Monty512.png logo512.png

# Generate multiple sizes for favicon from the favicon-specific image
echo "Creating favicon sizes..."
convert images/Monty_Bowtie_Favicon.png -resize 16x16 favicon-16.png
convert images/Monty192.png -resize 32x32 favicon-32.png
convert images/Monty512.png -resize 48x48 favicon-48.png

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
