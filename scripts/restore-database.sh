#!/bin/bash
# ============================================
# Database Restore Script
# Restores PostgreSQL database from backup file
# ============================================

set -euo pipefail

# Configuration
BACKUP_FILE="${1:-}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-platform_db}"
DB_USER="${POSTGRES_USER:-platform_user}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"
CREATE_DB="${CREATE_DB:-true}"

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
    error "Usage: $0 <backup_file>"
    error "Example: $0 /backups/database/backup_platform_db_20260210_120000.sql.gz"
    exit 1
fi

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    error "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Export password for psql
export PGPASSWORD="${DB_PASSWORD}"

log "Starting database restore..."
log "Backup file: ${BACKUP_FILE}"
log "Database: ${DB_NAME}"
log "Host: ${DB_HOST}:${DB_PORT}"

# Detect compression and decompress if needed
RESTORE_FILE="${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.gz ]]; then
    log "Decompressing gzip backup..."
    RESTORE_FILE="${BACKUP_FILE%.gz}"
    gunzip -c "${BACKUP_FILE}" > "${RESTORE_FILE}"
elif [[ "${BACKUP_FILE}" == *.bz2 ]]; then
    log "Decompressing bzip2 backup..."
    RESTORE_FILE="${BACKUP_FILE%.bz2}"
    bunzip2 -c "${BACKUP_FILE}" > "${RESTORE_FILE}"
elif [[ "${BACKUP_FILE}" == *.xz ]]; then
    log "Decompressing xz backup..."
    RESTORE_FILE="${BACKUP_FILE%.xz}"
    xzcat "${BACKUP_FILE}" > "${RESTORE_FILE}"
fi

# Check if database exists
DB_EXISTS=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || echo "0")

if [ "${DB_EXISTS}" = "1" ]; then
    warn "Database ${DB_NAME} already exists"
    read -p "Do you want to drop and recreate it? (yes/no): " CONFIRM
    if [ "${CONFIRM}" = "yes" ]; then
        log "Dropping existing database..."
        psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
    else
        error "Restore cancelled"
        exit 1
    fi
fi

# Restore database
log "Restoring database from backup..."
if psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -f "${RESTORE_FILE}" 2>&1; then
    log "Database restore completed successfully"
    
    # Cleanup temporary file if decompressed
    if [ "${RESTORE_FILE}" != "${BACKUP_FILE}" ]; then
        rm -f "${RESTORE_FILE}"
    fi
    
    # Verify restore
    log "Verifying restore..."
    TABLE_COUNT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    log "Tables restored: ${TABLE_COUNT}"
    
    log "Restore completed successfully"
    exit 0
else
    error "Database restore failed"
    
    # Cleanup temporary file if decompressed
    if [ "${RESTORE_FILE}" != "${BACKUP_FILE}" ]; then
        rm -f "${RESTORE_FILE}"
    fi
    
    exit 1
fi
