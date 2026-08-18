-- ─── Conversas sem participantes ─────────────────────────────────────────────
--
-- A tabela conversations não tem coluna user_id — quem liga a conversa aos
-- utilizadores é conversation_participants. Apagar uma conta faz cascade nos
-- participantes mas deixa a conversa lá, vazia e inalcançável, para sempre.
--
-- Um trigger em vez de limpeza no handler de eliminação: assim cobre todos os
-- caminhos por onde um participante pode sair, não só a eliminação de conta.

-- Limpa as que já lá estão.
DELETE FROM conversations c
WHERE NOT EXISTS (
  SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id
);

CREATE OR REPLACE FUNCTION apagar_conversa_sem_participantes()
RETURNS TRIGGER AS $$
BEGIN
  -- OLD.conversation_id pode já não existir se foi a própria conversa a ser
  -- apagada e o cascade a remover os participantes. O DELETE trata disso.
  DELETE FROM conversations c
  WHERE c.id = OLD.conversation_id
    AND NOT EXISTS (
      SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id
    );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversa_sem_participantes ON conversation_participants;

CREATE TRIGGER trg_conversa_sem_participantes
  AFTER DELETE ON conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION apagar_conversa_sem_participantes();
