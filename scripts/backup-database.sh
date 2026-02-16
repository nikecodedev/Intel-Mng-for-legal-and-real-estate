#!/bin/bash
# ============================================
# Database Backup Script
# Automated PostgreSQL backup with retention policy
# ============================================

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/database}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESSION="${COMPRESSION:-gzip}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database connection (from environment or defaults)
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-platform_db}"
DB_USER="${POSTGRES_USER:-platform_user}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

# Backup file naming
BACKUP_FILE="${BACKUP_DIR}/backup_${DB_NAME}_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.${COMPRESSION}"

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

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Export password for pg_dump
export PGPASSWORD="${DB_PASSWORD}"

log "Starting database backup..."
log "Database: ${DB_NAME}"
log "Host: ${DB_HOST}:${DB_PORT}"
log "Backup file: ${BACKUP_FILE}"

# Perform backup
if pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --verbose \
    --clean \
    --if-exists \
    --create \
    --format=plain \
    --file="${BACKUP_FILE}" 2>&1; then
    
    log "Database backup completed successfully"
    
    # Compress backup if requested
    if [ "${COMPRESSION}" != "none" ]; then
        log "Compressing backup..."
        case "${COMPRESSION}" in
            gzip)
                gzip -f "${BACKUP_FILE}"
                FINAL_FILE="${COMPRESSED_FILE}"
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
            BACKUP_SIZE=$(du -h "${FINAL_FILE}" | cut -f1)
            log "Backup compressed: ${FINAL_FILE} (${BACKUP_SIZE})"
        fi
    else
        FINAL_FILE="${BACKUP_FILE}"
        BACKUP_SIZE=$(du -h "${FINAL_FILE}" | cut -f1)
        log "Backup size: ${BACKUP_SIZE}"
    fi
    
    # Create backup manifest
    MANIFEST_FILE="${BACKUP_DIR}/backup_${DB_NAME}_${TIMESTAMP}.manifest"
    cat > "${MANIFEST_FILE}" <<EOF
{
  "backup_id": "${TIMESTAMP}",
  "database": "${DB_NAME}",
  "host": "${DB_HOST}",
  "port": ${DB_PORT},
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_file": "$(basename ${FINAL_FILE})",
  "backup_size": "${BACKUP_SIZE}",
  "compression": "${COMPRESSION}",
  "pg_dump_version": "$(pg_dump --version | cut -d' ' -f3)",
  "postgres_version": "$(psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -c 'SELECT version();' | xargs)"
}
EOF
    
    log "Backup manifest created: ${MANIFEST_FILE}"
    
    # Cleanup old backups
    log "Cleaning up backups older than ${RETENTION_DAYS} days..."
    find "${BACKUP_DIR}" -name "backup_${DB_NAME}_*.sql*" -type f -mtime +${RETENTION_DAYS} -delete
    find "${BACKUP_DIR}" -name "backup_${DB_NAME}_*.manifest" -type f -mtime +${RETENTION_DAYS} -delete
    log "Cleanup completed"
    
    log "Backup completed successfully: ${FINAL_FILE}"
    exit 0
else
    error "Database backup failed"
    exit 1
fi
