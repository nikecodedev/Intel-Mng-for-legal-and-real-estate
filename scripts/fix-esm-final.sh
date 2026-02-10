#!/bin/bash

# Final ES Module import fixer
# Uses Python for more reliable pattern matching

set -e

cd "$(dirname "$0")/../apps/api/src" || exit 1

python3 << 'PYTHON_SCRIPT'
import re
import os
from pathlib import Path

def fix_imports_in_file(filepath):
    """Fix ES module imports in a TypeScript file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Fix relative imports that don't have .js
    # Pattern: from './module' or from '../module' (but not from './module.js')
    
    # Fix: from './something' -> from './something.js' (if .js not present)
    content = re.sub(
        r"from\s+['\"](\.[^'\"]*?)(?<!\.js)['\"]",
        r"from '\1.js'",
        content
    )
    
    # Fix: from '../something' -> from '../something.js' (if .js not present)
    content = re.sub(
        r"from\s+['\"](\.[\./][^'\"]*?)(?<!\.js)['\"]",
        r"from '\1.js'",
        content
    )
    
    # Fix directory imports to point to index.js
    # from '../middleware' -> from '../middleware/index.js'
    content = re.sub(
        r"from\s+['\"]([^'\"]*?/middleware)(?!/index\.js)['\"]",
        r"from '\1/index.js'",
        content
    )
    
    content = re.sub(
        r"from\s+['\"]([^'\"]*?/routes)(?!/index\.js)['\"]",
        r"from '\1/index.js'",
        content
    )
    
    content = re.sub(
        r"from\s+['\"]([^'\"]*?/config)(?!/index\.js)['\"]",
        r"from '\1/index.js'",
        content
    )
    
    # Remove double .js.js
    content = re.sub(r'\.js\.js', '.js', content)
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

# Process all TypeScript files
fixed = 0
total = 0

for ts_file in Path('.').rglob('*.ts'):
    total += 1
    if fix_imports_in_file(str(ts_file)):
        fixed += 1
        print(f"✅ Fixed: {ts_file}")

print(f"\n📊 Summary: Fixed {fixed} of {total} files")
PYTHON_SCRIPT

echo "✅ Done!"
