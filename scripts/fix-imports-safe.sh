#!/bin/bash

# Safe ES Module import fixer
# Only adds .js to imports that don't already have it
# Prevents infinite loops

set -e

echo "🔧 Safely fixing ES Module imports..."
echo "======================================"

cd "$(dirname "$0")/../apps/api/src" || exit 1

# Function to safely fix imports in a file
fix_file_imports() {
    local file="$1"
    local temp_file="${file}.tmp.$$"
    local changed=false
    
    # Read file and process line by line
    while IFS= read -r line || [ -n "$line" ]; do
        local new_line="$line"
        
        # Only match imports that DON'T already have .js
        # Pattern: from './something' or from '../something' (but NOT from './something.js')
        
        # Fix: from './module' -> from './module.js' (only if .js not present)
        if [[ "$new_line" =~ from\ ['\"](\./[^'\"]*[^j][^s])['\"] ]]; then
            new_line=$(echo "$new_line" | sed "s|from ['\"]\\(\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g")
            changed=true
        fi
        
        # Fix: from '../module' -> from '../module.js' (only if .js not present)
        if [[ "$new_line" =~ from\ ['\"](\.\./[^'\"]*[^j][^s])['\"] ]]; then
            new_line=$(echo "$new_line" | sed "s|from ['\"]\\(\\.\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g")
            changed=true
        fi
        
        # Fix directory imports: from '../middleware' -> from '../middleware/index.js'
        if [[ "$new_line" =~ from\ ['\"](\.\.*/middleware)['\"] ]]; then
            new_line=$(echo "$new_line" | sed "s|from ['\"]\\(\\.\\.*/middleware\\)\\(['\"]\\)|from '\\1/index.js\\2|g")
            changed=true
        fi
        
        # Fix directory imports: from '../routes' -> from '../routes/index.js'
        if [[ "$new_line" =~ from\ ['\"](\.\.*/routes)['\"] ]]; then
            new_line=$(echo "$new_line" | sed "s|from ['\"]\\(\\.\\.*/routes\\)\\(['\"]\\)|from '\\1/index.js\\2|g")
            changed=true
        fi
        
        # Remove double .js.js
        new_line=$(echo "$new_line" | sed "s|\\.js\\.js|.js|g")
        
        echo "$new_line" >> "$temp_file"
    done < "$file"
    
    # Only replace if changed
    if [ "$changed" = true ] && ! cmp -s "$file" "$temp_file"; then
        mv "$temp_file" "$file"
        echo "✅ Fixed: $file"
        return 0
    else
        rm -f "$temp_file"
        return 1
    fi
}

# Process files
fixed=0
total=0

for file in $(find . -name "*.ts" -type f); do
    total=$((total + 1))
    if fix_file_imports "$file"; then
        fixed=$((fixed + 1))
    fi
done

echo ""
echo "📊 Summary: Fixed $fixed of $total files"
echo "✅ Done!"
