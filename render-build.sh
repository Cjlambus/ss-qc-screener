#!/bin/bash
set -e

echo "==> Installing system dependencies (ghostscript, tesseract, poppler-utils)..."
apt-get update -qq
apt-get install -y ghostscript tesseract-ocr poppler-utils imagemagick 2>&1 | tail -10

echo "==> Fixing ImageMagick PDF policy..."
# Allow ImageMagick to read PDFs (disabled by default for security)
sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml 2>/dev/null || \
sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-7/policy.xml 2>/dev/null || \
echo "Policy file not found, skipping..."

echo "==> Running npm build..."
npm install
npm run build

echo "==> Build complete."
