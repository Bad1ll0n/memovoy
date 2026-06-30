#!/usr/bin/env bash
# setup_db.sh — Gestão da base de dados MemoVoy com Flyway
# Uso:
#   ./setup_db.sh migrate           — aplica todas as migrations pendentes
#   ./setup_db.sh migrate-only      — mesmo que migrate (alias)
#   ./setup_db.sh validate          — valida que todas as migrations foram aplicadas
#   ./setup_db.sh info              — lista estado de cada migration
#   ./setup_db.sh clean             — ATENÇÃO: apaga e recria o schema (só dev)
#   ./setup_db.sh repair            — repara checksums de migrations editadas
#   ./setup_db.sh seed              — aplica V10 seed data (só dev)

set -euo pipefail

# ============================================================
# Configuração
# ============================================================

DB_URL="${DATABASE_URL:-postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/db/migrations" 2>/dev/null && pwd || echo "./db/migrations")"
FLYWAY_IMAGE="flyway/flyway:10-alpine"
COMMAND="${1:-migrate}"

# Extrair componentes da URL
# Formato: postgresql://user:pass@host:port/db
DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')

FLYWAY_URL="jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}"

# ============================================================
# Cores para output
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info()    { echo -e "${GREEN}[DB]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[DB]${NC} $*"; }
log_error()   { echo -e "${RED}[DB]${NC} $*" >&2; }

# ============================================================
# Verificar pré-condições
# ============================================================

if [ ! -d "$MIGRATIONS_DIR" ]; then
  log_error "Directório de migrations não encontrado: $MIGRATIONS_DIR"
  exit 1
fi

migration_count=$(find "$MIGRATIONS_DIR" -name "V*.sql" | wc -l | tr -d ' ')
log_info "Migrations disponíveis: $migration_count ficheiros em $MIGRATIONS_DIR"

# ============================================================
# Executar Flyway via Docker
# ============================================================

run_flyway() {
  local flyway_cmd="$1"

  docker run --rm \
    --network host \
    -v "${MIGRATIONS_DIR}:/flyway/sql:ro" \
    "$FLYWAY_IMAGE" \
    -url="$FLYWAY_URL" \
    -user="$DB_USER" \
    -password="$DB_PASS" \
    -locations="filesystem:/flyway/sql" \
    -baselineOnMigrate=false \
    -validateOnMigrate=true \
    -outOfOrder=false \
    -connectRetries=10 \
    "$flyway_cmd"
}

# ============================================================
# Comandos disponíveis
# ============================================================

case "$COMMAND" in
  migrate|migrate-only)
    log_info "A aplicar migrations pendentes…"
    run_flyway migrate
    log_info "✓ Migrations aplicadas com sucesso"
    ;;

  validate)
    log_info "A validar estado das migrations…"
    run_flyway validate
    log_info "✓ Schema em conformidade com as migrations"
    ;;

  info)
    log_info "Estado das migrations:"
    run_flyway info
    ;;

  clean)
    log_warn "ATENÇÃO: isto vai apagar TODOS os dados e o schema!"
    if [ "${FORCE:-}" != "true" ]; then
      read -r -p "Tens a certeza? Escreve 'sim' para continuar: " confirm
      if [ "$confirm" != "sim" ]; then
        log_info "Operação cancelada."
        exit 0
      fi
    fi
    log_warn "A limpar schema…"
    run_flyway clean
    log_info "A re-aplicar migrations…"
    run_flyway migrate
    log_info "✓ BD recriada do zero"
    ;;

  repair)
    log_warn "A reparar checksums das migrations…"
    run_flyway repair
    log_info "✓ Checksums reparados"
    ;;

  seed)
    log_info "A aplicar seed data (V10)…"
    # V10 já é uma migration normal — aplicar via migrate
    run_flyway migrate
    log_info "✓ Seed data aplicado"
    ;;

  *)
    log_error "Comando desconhecido: $COMMAND"
    echo "Uso: $0 {migrate|validate|info|clean|repair|seed}"
    exit 1
    ;;
esac
