#!/bin/bash

# Comprehensive ES Module import fixer
# Adds .js extensions to all relative imports in TypeScript files

set -e

echo "🔧 Fixing all ES Module imports..."
echo "==================================="

cd "$(dirname "$0")/../apps/api/src" || exit 1

# Function to fix imports in a file
fix_imports() {
    local file="$1"
    local temp_file="${file}.tmp"
    local changed=false
    
    # Create temp file
    cp "$file" "$temp_file"
    
    # Fix various import patterns (only if .js is not already present)
    # Pattern 1: from './module' -> from './module.js'
    sed -i "s|from ['\"]\\(\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g" "$temp_file" 2>/dev/null || true
    
    # Pattern 2: from '../module' -> from '../module.js'  
    sed -i "s|from ['\"]\\(\\.\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g" "$temp_file" 2>/dev/null || true
    
    # Pattern 3: from '../../module' -> from '../../module.js'
    sed -i "s|from ['\"]\\(\\.\\./\\.\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g" "$temp_file" 2>/dev/null || true
    
    # Pattern 4: from '../../../module' -> from '../../../module.js'
    sed -i "s|from ['\"]\\(\\.\\./\\.\\./\\.\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g" "$temp_file" 2>/dev/null || true
    
    # Remove double .js.js
    sed -i "s|\\.js\\.js|.js|g" "$temp_file" 2>/dev/null || true
    
    # Check if file changed
    if ! cmp -s "$file" "$temp_file"; then
        mv "$temp_file" "$file"
        changed=true
    else
        rm -f "$temp_file"
    fi
    
    echo "$changed"
}

# Process all TypeScript files
fixed=0
total=0

while IFS= read -r -d '' file; do
    total=$((total + 1))
    if [ "$(fix_imports "$file")" = "true" ]; then
        fixed=$((fixed + 1))
        echo "✅ Fixed: $file"
    fi
done < <(find . -name "*.ts" -type f -print0)

echo ""
echo "📊 Summary:"
echo "   Total files: $total"
echo "   Fixed: $fixed"
echo "   Already correct: $((total - fixed))"
echo ""
echo "✅ Done!"
