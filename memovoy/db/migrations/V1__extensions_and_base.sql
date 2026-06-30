-- ============================================================
-- MemoVoy — V1: Extensions e funções base
-- Executar ANTES de qualquer outra migration
-- ============================================================

-- Extensões obrigatórias
CREATE EXTENSION IF NOT EXISTS "postgis";       -- geo queries
CREATE EXTENSION IF NOT EXISTS "pg_idkit";      -- UUID v7
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- GIN indexes em arrays
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- encriptação PII
CREATE EXTENSION IF NOT EXISTS "timescaledb";   -- time-series analytics

-- Função helper: UUID v7 como default em todas as tabelas
CREATE OR REPLACE FUNCTION generate_ulid()
RETURNS UUID AS $$ SELECT idkit_uuidv7() $$ LANGUAGE SQL;

-- Função helper: atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
