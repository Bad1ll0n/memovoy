#!/bin/bash
# ============================================================
# MemoVoy — Setup local da base de dados
# Requer: PostgreSQL 16, Docker (opcional)
# ============================================================

set -e  # Abortar em qualquer erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[MemoVoy]${NC} $1"; }
ok()     { echo -e "${GREEN}[OK]${NC} $1"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ------------------------------------------------------------
# Opção 1: Docker (recomendado para desenvolvimento local)
# ------------------------------------------------------------
setup_docker() {
  log "A iniciar PostgreSQL 16 com extensões via Docker..."

  docker run -d \
    --name memovoy-db \
    -e POSTGRES_USER=memovoy \
    -e POSTGRES_PASSWORD=memovoy_dev_password \
    -e POSTGRES_DB=memovoy_dev \
    -p 5432:5432 \
    timescale/timescaledb-ha:pg16 \
    2>/dev/null || {
      warn "Container já existe. A reiniciar..."
      docker start memovoy-db
    }

  log "A aguardar PostgreSQL ficar disponível..."
  until docker exec memovoy-db pg_isready -U memovoy -q; do
    sleep 1
  done
  ok "PostgreSQL disponível"

  # Instalar extensões adicionais
  log "A instalar extensões PostgreSQL..."
  docker exec memovoy-db psql -U memovoy -d memovoy_dev -c "
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS btree_gin;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  " > /dev/null
  ok "Extensões instaladas"

  # pg_idkit requer instalação manual ou imagem custom
  # Ver: https://github.com/cartacode/pg_idkit
  warn "pg_idkit requer instalação manual se não estiver na imagem."
  warn "Alternativa em dev: usar gen_random_uuid() até instalar pg_idkit."
}

# ------------------------------------------------------------
# Opção 2: PostgreSQL local já instalado
# ------------------------------------------------------------
setup_local() {
  log "A usar PostgreSQL local..."

  createdb memovoy_dev  2>/dev/null || warn "Base de dados já existe"
  createdb memovoy_staging 2>/dev/null || true
  createdb memovoy_test 2>/dev/null || true

  ok "Bases de dados criadas: memovoy_dev, memovoy_staging, memovoy_test"
}

# ------------------------------------------------------------
# Executar migrations com Flyway
# ------------------------------------------------------------
run_migrations() {
  local DB_URL="${1:-postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev}"

  log "A executar migrations Flyway..."

  # Verificar se Flyway está instalado
  if ! command -v flyway &> /dev/null; then
    warn "Flyway não encontrado. A instalar via Docker..."
    docker run --rm \
      --network host \
      -v "$(pwd)/db/migrations:/flyway/sql" \
      flyway/flyway:10 \
      -url="jdbc:$DB_URL" \
      -user=memovoy \
      -password=memovoy_dev_password \
      migrate
  else
    flyway \
      -url="jdbc:$DB_URL" \
      -user=memovoy \
      -password=memovoy_dev_password \
      -locations="filesystem:./db/migrations" \
      migrate
  fi

  ok "Migrations executadas com sucesso"
}

# ------------------------------------------------------------
# Alternativa: executar migrations directamente com psql
# (sem Flyway — para desenvolvimento rápido)
# ------------------------------------------------------------
run_migrations_psql() {
  local PSQL_URL="${1:-postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev}"

  log "A executar migrations com psql (ordem manual)..."

  MIGRATIONS_DIR="./db/migrations"

  for migration in $(ls $MIGRATIONS_DIR/V*.sql | sort -V); do
    filename=$(basename "$migration")
    log "  → $filename"
    psql "$PSQL_URL" -f "$migration" -v ON_ERROR_STOP=1 > /dev/null || {
      error "Migration falhou: $filename"
    }
  done

  ok "Todas as migrations executadas"
}

# ------------------------------------------------------------
# Verificação final
# ------------------------------------------------------------
verify_schema() {
  local PSQL_URL="${1:-postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev}"

  log "A verificar schema..."

  TABLE_COUNT=$(psql "$PSQL_URL" -t -c "
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  " | tr -d ' ')

  if [ "$TABLE_COUNT" -ge 30 ]; then
    ok "Schema válido: $TABLE_COUNT tabelas encontradas"
  else
    error "Schema incompleto: apenas $TABLE_COUNT tabelas (esperado >= 30)"
  fi

  # Verificar extensões
  psql "$PSQL_URL" -c "\dx" | grep -q "postgis" && ok "PostGIS instalado" || warn "PostGIS em falta"
  psql "$PSQL_URL" -c "\dx" | grep -q "timescaledb" && ok "TimescaleDB instalado" || warn "TimescaleDB em falta"
  psql "$PSQL_URL" -c "\dx" | grep -q "pg_trgm" && ok "pg_trgm instalado" || warn "pg_trgm em falta"
}

# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
log "MemoVoy — Setup da base de dados"
echo ""

case "${1:-docker}" in
  docker)
    setup_docker
    run_migrations_psql "postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev"
    verify_schema "postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev"
    ;;
  local)
    setup_local
    run_migrations_psql
    verify_schema
    ;;
  migrate-only)
    run_migrations_psql "${2:-postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev}"
    verify_schema "${2:-postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev}"
    ;;
  verify)
    verify_schema "${2:-postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev}"
    ;;
  *)
    echo "Uso: $0 [docker|local|migrate-only|verify] [db_url]"
    echo ""
    echo "  docker        — Inicia PostgreSQL via Docker e executa migrations (padrão)"
    echo "  local         — Usa PostgreSQL local já instalado"
    echo "  migrate-only  — Executa apenas as migrations (BD já existe)"
    echo "  verify        — Verifica se o schema está correcto"
    exit 1
    ;;
esac

echo ""
ok "Setup completo!"
echo ""
echo "  Ligação: postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev"
echo "  Utilizador dev: memovoy_dev / TestPassword123!"
echo ""
log "Próximo passo: instalar dependências da API e iniciar o servidor"
