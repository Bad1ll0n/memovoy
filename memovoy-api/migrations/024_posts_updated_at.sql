-- ─── Coluna updated_at em posts ──────────────────────────────────────────────
--
-- O handler PATCH /posts/:id sempre fez `SET ..., updated_at = NOW()`, mas a
-- coluna nunca existiu: a tabela foi criada em 001_initial.sql só com
-- created_at. Editar a legenda de um post devolvia 500 desde o início.
--
-- Preenchida com created_at nas linhas existentes — sem informação melhor, um
-- post por editar foi actualizado pela última vez quando foi criado.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE posts SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE posts
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;
