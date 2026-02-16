#!/bin/bash
# ============================================
# File Storage Backup Script
# Backs up uploaded documents and files
# ============================================

set -euo pipefail

# Configuration
STORAGE_DIR="${STORAGE_DIR:-/var/storage/documents}"
BACKUP_DIR="${BACKUP_DIR:-/backups/files}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESSION="${COMPRESSION:-gzip}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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

# Check if storage directory exists
if [ ! -d "${STORAGE_DIR}" ]; then
    error "Storage directory not found: ${STORAGE_DIR}"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

log "Starting file storage backup..."
log "Storage directory: ${STORAGE_DIR}"
log "Backup directory: ${BACKUP_DIR}"

# Create temporary backup directory
TEMP_BACKUP_DIR="${BACKUP_DIR}/temp_${TIMESTAMP}"
mkdir -p "${TEMP_BACKUP_DIR}"

# Backup files using rsync (preserves permissions, timestamps, etc.)
log "Copying files..."
if rsync -av --delete "${STORAGE_DIR}/" "${TEMP_BACKUP_DIR}/" 2>&1; then
    log "Files copied successfully"
    
    # Calculate backup size
    BACKUP_SIZE=$(du -sh "${TEMP_BACKUP_DIR}" | cut -f1)
    log "Backup size: ${BACKUP_SIZE}"
    
    # Create backup archive
    BACKUP_FILE="${BACKUP_DIR}/files_${TIMESTAMP}.tar"
    log "Creating archive..."
    
    if tar -cf "${BACKUP_FILE}" -C "${BACKUP_DIR}" "temp_${TIMESTAMP}" 2>&1; then
        log "Archive created: ${BACKUP_FILE}"
        
        # Compress if requested
        if [ "${COMPRESSION}" != "none" ]; then
            log "Compressing archive..."
            case "${COMPRESSION}" in
                gzip)
                    gzip -f "${BACKUP_FILE}"
                    FINAL_FILE="${BACKUP_FILE}.gz"
                    ;;
                bzip2)
                    bzip2 -f "${BACKUP_FILE}"
                    FINAL_FILE="${BACKUP_FILE}.bz2"
                    ;;
                xz)
                    xz -f "${BACKUP_FILE}"
                    FINAL_FILE="${BACKUP_FILE}.xz"
                    ;;
                *)
                    warn "Unknown compression type: ${COMPRESSION}, skipping compression"
                    FINAL_FILE="${BACKUP_FILE}"
                    ;;
            esac
            
            if [ -f "${FINAL_FILE}" ]; then
                COMPRESSED_SIZE=$(du -h "${FINAL_FILE}" | cut -f1)
                log "Archive compressed: ${FINAL_FILE} (${COMPRESSED_SIZE})"
            fi
        else
            FINAL_FILE="${BACKUP_FILE}"
            ARCHIVE_SIZE=$(du -h "${FINAL_FILE}" | cut -f1)
            log "Archive size: ${ARCHIVE_SIZE}"
        fi
        
        # Remove temporary directory
        rm -rf "${TEMP_BACKUP_DIR}"
        
        # Create backup manifest
        MANIFEST_FILE="${BACKUP_DIR}/files_${TIMESTAMP}.manifest"
        FILE_COUNT=$(find "${STORAGE_DIR}" -type f | wc -l)
        cat > "${MANIFEST_FILE}" <<EOF
{
  "backup_id": "${TIMESTAMP}",
  "storage_directory": "${STORAGE_DIR}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_file": "$(basename ${FINAL_FILE})",
  "backup_size": "${BACKUP_SIZE}",
  "compressed_size": "${COMPRESSED_SIZE:-${ARCHIVE_SIZE:-unknown}}",
  "file_count": ${FILE_COUNT},
  "compression": "${COMPRESSION}"
}
EOF
        
        log "Backup manifest created: ${MANIFEST_FILE}"
        
        # Cleanup old backups
        log "Cleaning up backups older than ${RETENTION_DAYS} days..."
        find "${BACKUP_DIR}" -name "files_*.tar*" -type f -mtime +${RETENTION_DAYS} -delete
        find "${BACKUP_DIR}" -name "files_*.manifest" -type f -mtime +${RETENTION_DAYS} -delete
        log "Cleanup completed"
        
        log "File backup completed successfully: ${FINAL_FILE}"
        exit 0
    else
        error "Archive creation failed"
        rm -rf "${TEMP_BACKUP_DIR}"
        exit 1
    fi
else
    error "File copy failed"
    rm -rf "${TEMP_BACKUP_DIR}"
    exit 1
fi
