-- Estado de resolução das denúncias.
--
-- A tabela guardava quem denunciou, o quê e porquê, e a classificação por IA —
-- mas não havia forma de dizer que uma denúncia já tinha sido tratada, porque
-- também não havia nada que as lesse. Sem isto, a fila de moderação nunca
-- diminui e a mesma denúncia aparece para sempre.

ALTER TABLE content_reports
  ADD COLUMN IF NOT EXISTS status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resolution   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolver_note TEXT;

-- 'pending' à espera de decisão, 'resolved' já tratada.
ALTER TABLE content_reports
  DROP CONSTRAINT IF EXISTS content_reports_status_check;
ALTER TABLE content_reports
  ADD CONSTRAINT content_reports_status_check
  CHECK (status IN ('pending', 'resolved'));

-- 'dismissed' = a denúncia não procedia; 'removed' = o conteúdo foi retirado.
ALTER TABLE content_reports
  DROP CONSTRAINT IF EXISTS content_reports_resolution_check;
ALTER TABLE content_reports
  ADD CONSTRAINT content_reports_resolution_check
  CHECK (resolution IS NULL OR resolution IN ('dismissed', 'removed'));

-- A fila de moderação lê sempre por estado e ordena por data.
CREATE INDEX IF NOT EXISTS idx_content_reports_status
  ON content_reports (status, created_at DESC);
