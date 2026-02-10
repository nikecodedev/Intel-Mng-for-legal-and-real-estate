#!/bin/bash

# Comprehensive ES Module import fixer
# Fixes ALL relative imports to have .js extensions
# Prevents infinite loops by using backup files

set -e

echo "🔧 Fixing ALL ES Module imports..."
echo "==================================="

cd "$(dirname "$0")/../apps/api/src" || exit 1

# Function to fix a single file
fix_file() {
    local file="$1"
    local temp_file="${file}.fix.$$"
    local changed=false
    
    # Read file line by line
    while IFS= read -r line || [ -n "$line" ]; do
        local original="$line"
        local modified="$line"
        
        # Fix relative imports that don't have .js yet
        # Pattern: from './something' or from '../something' (but NOT from './something.js')
        
        # Skip if line doesn't contain 'from'
        if [[ ! "$modified" =~ from ]]; then
            echo "$modified" >> "$temp_file"
            continue
        fi
        
        # Fix: from './module' -> from './module.js' (if .js not present)
        if [[ "$modified" =~ from\ ['\"](\./[^'\"]*[^j][^s])['\"] ]] || [[ "$modified" =~ from\ ['\"](\./[^'\"]*[^\.js])['\"] ]]; then
            modified=$(echo "$modified" | sed -E "s|from ['\"](\./[^'\"]*[^j][^s])['\"]|from '\\1.js'|g")
            modified=$(echo "$modified" | sed -E "s|from ['\"](\./[^'\"]*[^\.js])['\"]|from '\\1.js'|g")
        fi
        
        # Fix: from '../module' -> from '../module.js' (if .js not present)
        if [[ "$modified" =~ from\ ['\"](\.\./[^'\"]*[^j][^s])['\"] ]] || [[ "$modified" =~ from\ ['\"](\.\./[^'\"]*[^\.js])['\"] ]]; then
            modified=$(echo "$modified" | sed -E "s|from ['\"](\.\./[^'\"]*[^j][^s])['\"]|from '\\1.js'|g")
            modified=$(echo "$modified" | sed -E "s|from ['\"](\.\./[^'\"]*[^\.js])['\"]|from '\\1.js'|g")
        fi
        
        # Fix directory imports to point to index.js
        # from '../middleware' -> from '../middleware/index.js'
        modified=$(echo "$modified" | sed -E "s|from ['\"](\.\.*/middleware)['\"]|from '\\1/index.js'|g")
        modified=$(echo "$modified" | sed -E "s|from ['\"](\.\.*/routes)['\"]|from '\\1/index.js'|g")
        modified=$(echo "$modified" | sed -E "s|from ['\"]\\./middleware['\"]|from './middleware/index.js'|g")
        modified=$(echo "$modified" | sed -E "s|from ['\"]\\./routes['\"]|from './routes/index.js'|g")
        
        # Fix config imports
        modified=$(echo "$modified" | sed -E "s|from ['\"](\.\.*/config)['\"]|from '\\1/index.js'|g")
        modified=$(echo "$modified" | sed -E "s|from ['\"]\\./config['\"]|from './config/index.js'|g")
        
        # Remove double .js.js
        modified=$(echo "$modified" | sed "s|\.js\.js|.js|g")
        
        if [ "$modified" != "$original" ]; then
            changed=true
        fi
        
        echo "$modified" >> "$temp_file"
    done < "$file"
    
    # Replace file if changed
    if [ "$changed" = true ]; then
        mv "$temp_file" "$file"
        return 0
    else
        rm -f "$temp_file"
        return 1
    fi
}

# Process all TypeScript files
fixed=0
total=0

for file in $(find . -name "*.ts" -type f | sort); do
    total=$((total + 1))
    if fix_file "$file"; then
        fixed=$((fixed + 1))
        echo "✅ Fixed: $file"
    fi
done

echo ""
echo "📊 Summary: Fixed $fixed of $total files"
echo "✅ Done!"
