#!/bin/bash

# Fix ES Module imports - Add .js extensions to relative imports
# This script safely adds .js extensions only if they don't already exist

set -e

echo "🔧 Fixing ES Module imports..."
echo "================================"

cd "$(dirname "$0")/../apps/api/src" || exit 1

# Counter for fixed files
fixed_count=0

# Find all TypeScript files
find . -name "*.ts" -type f | while read -r file; do
    changed=false
    
    # Fix relative imports that don't already have .js
    # Pattern: from './something' or from '../something' (but not from './something.js')
    
    # Fix imports like: from './module' -> from './module.js'
    if sed -i.tmp "s|from ['\"]\\(\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g" "$file" 2>/dev/null; then
        if ! cmp -s "$file" "$file.tmp"; then
            changed=true
        fi
        rm -f "$file.tmp"
    fi
    
    # Fix imports like: from '../module' -> from '../module.js'
    if sed -i.tmp "s|from ['\"]\\(\\.\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g" "$file" 2>/dev/null; then
        if ! cmp -s "$file" "$file.tmp"; then
            changed=true
        fi
        rm -f "$file.tmp"
    fi
    
    # Fix imports like: from '../../module' -> from '../../module.js'
    if sed -i.tmp "s|from ['\"]\\(\\.\\./\\.\\./[^'\"]*\\)\\(['\"]\\)|from '\\1.js\\2|g" "$file" 2>/dev/null; then
        if ! cmp -s "$file" "$file.tmp"; then
            changed=true
        fi
        rm -f "$file.tmp"
    fi
    
    # Skip if already has .js extension
    sed -i.tmp "s|\\(from ['\"][^'\"]*\\)\\.js\\.js\\(['\"]\\)|\\1.js\\2|g" "$file" 2>/dev/null
    rm -f "$file.tmp"
    
    if [ "$changed" = true ]; then
        echo "✅ Fixed: $file"
        fixed_count=$((fixed_count + 1))
    fi
done

echo ""
echo "✅ Fixed $fixed_count files"
echo "Done!"
