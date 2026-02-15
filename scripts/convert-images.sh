#!/usr/bin/env bash
set -euo pipefail

# Bulk convert images to WebP and generate responsive sizes (800px and 400px widths)
# Requires: cwebp (libwebp) and optionally imagemagick/convert for checks
# Install (Ubuntu): sudo apt update && sudo apt install webp imagemagick -y

SRC_DIR="assets/images"

echo "Converting images in $SRC_DIR to WebP and responsive sizes..."

shopt -s nullglob
for img in "$SRC_DIR"/*.{png,jpg,jpeg}; do
  base="${img%.*}"
  echo "Processing: $img"
  # full-size webp
  cwebp -q 80 "$img" -o "${base}.webp" >/dev/null
  # responsive sizes (800px and 400px widths)
  cwebp -q 80 "$img" -resize 800 0 -o "${base}-800.webp" >/dev/null
  cwebp -q 80 "$img" -resize 400 0 -o "${base}-400.webp" >/dev/null
done

echo "Done. Generated .webp, -800.webp and -400.webp files next to originals."

echo "Tip: Update your HTML to use <picture> with srcset, or add srcset attributes pointing to the -400.webp and -800.webp files for responsive images."}