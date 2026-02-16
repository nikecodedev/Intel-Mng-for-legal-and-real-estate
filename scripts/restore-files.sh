#!/bin/bash
# ============================================
# File Storage Restore Script
# Restores uploaded documents and files from backup
# ============================================

set -euo pipefail

# Configuration
BACKUP_FILE="${1:-}"
STORAGE_DIR="${STORAGE_DIR:-/var/storage/documents}"
RESTORE_MODE="${RESTORE_MODE:-merge}" # merge or replace

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if backup file is provided
if [ -z "${BACKUP_FILE}" ]; then
    error "Usage: $0 <backup_file> [restore_mode]"
    error "Example: $0 /backups/files/files_20260210_120000.tar.gz merge"
    error "Restore modes: merge (default) or replace"
    exit 1
fi

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    error "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

log "Starting file storage restore..."
log "Backup file: ${BACKUP_FILE}"
log "Storage directory: ${STORAGE_DIR}"
log "Restore mode: ${RESTORE_MODE}"

# Create storage directory if it doesn't exist
mkdir -p "${STORAGE_DIR}"

# Detect compression and decompress if needed
RESTORE_FILE="${BACKUP_FILE}"
TEMP_DIR=$(mktemp -d)

if [[ "${BACKUP_FILE}" == *.gz ]]; then
    log "Decompressing gzip backup..."
    gunzip -c "${BACKUP_FILE}" > "${TEMP_DIR}/backup.tar"
    RESTORE_FILE="${TEMP_DIR}/backup.tar"
elif [[ "${BACKUP_FILE}" == *.bz2 ]]; then
    log "Decompressing bzip2 backup..."
    bunzip2 -c "${BACKUP_FILE}" > "${TEMP_DIR}/backup.tar"
    RESTORE_FILE="${TEMP_DIR}/backup.tar"
elif [[ "${BACKUP_FILE}" == *.xz ]]; then
    log "Decompressing xz backup..."
    xzcat "${BACKUP_FILE}" > "${TEMP_DIR}/backup.tar"
    RESTORE_FILE="${TEMP_DIR}/backup.tar"
fi

# Extract archive
log "Extracting archive..."
if tar -xf "${RESTORE_FILE}" -C "${TEMP_DIR}" 2>&1; then
    log "Archive extracted"
    
    # Find extracted directory
    EXTRACTED_DIR=$(find "${TEMP_DIR}" -type d -name "temp_*" | head -1)
    if [ -z "${EXTRACTED_DIR}" ]; then
        error "Could not find extracted directory"
        rm -rf "${TEMP_DIR}"
        exit 1
    fi
    
    # Restore files
    if [ "${RESTORE_MODE}" = "replace" ]; then
        warn "Replace mode: Existing files will be overwritten"
        read -p "Are you sure? (yes/no): " CONFIRM
        if [ "${CONFIRM}" != "yes" ]; then
            log "Restore cancelled"
            rm -rf "${TEMP_DIR}"
            exit 0
        fi
        log "Replacing files..."
        rsync -av --delete "${EXTRACTED_DIR}/" "${STORAGE_DIR}/"
    else
        log "Merging files (existing files will be preserved)..."
        rsync -av "${EXTRACTED_DIR}/" "${STORAGE_DIR}/"
    fi
    
    # Cleanup
    rm -rf "${TEMP_DIR}"
    
    # Verify restore
    log "Verifying restore..."
    FILE_COUNT=$(find "${STORAGE_DIR}" -type f | wc -l)
    log "Files restored: ${FILE_COUNT}"
    
    log "File restore completed successfully"
    exit 0
else
    error "Archive extraction failed"
    rm -rf "${TEMP_DIR}"
    exit 1
fi
