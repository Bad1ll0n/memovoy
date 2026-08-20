-- Pedidos de seguimento, para que "conta privada" queira mesmo dizer alguma
-- coisa.
--
-- Até aqui seguir era imediato: o POST /users/:id/follow inseria logo em
-- follows, mesmo que a conta fosse privada. O cadeado existia com a chave
-- colada ao lado — bastava carregar em Seguir.
--
-- Tabela à parte, e não uma coluna `status` em follows, por uma razão medida:
-- 23 sítios do código consultam a tabela follows. Uma coluna de estado
-- obrigaria a acrescentar "AND status = 'accepted'" em todos os 23, e quando
-- faltasse num deles não haveria erro nenhum — só um estranho a ver conteúdo
-- privado. É exactamente o modo de falha que corrigimos duas vezes esta
-- semana.
--
-- Assim, follows continua a significar precisamente o que significava: uma
-- ligação aceite. Nenhuma das 23 consultas muda, e as contagens de seguidores
-- continuam certas sem se lhes tocar.
--
-- Aceitar é mover a linha para follows; recusar é apagá-la. Não se guarda a
-- recusa: um "rejeitado" persistido teria de ser filtrado em todo o lado que
-- lê pedidos, e voltávamos ao problema de cima. A consequência assumida é que
-- quem for recusado pode voltar a pedir — atenuado pelo rate limit que já
-- existe na rota.

CREATE TABLE IF NOT EXISTS follow_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT follow_requests_unicos UNIQUE (requester_id, target_id),
  CONSTRAINT follow_requests_nao_proprio CHECK (requester_id <> target_id)
);

-- A fila lê-se sempre por destinatário e por ordem de chegada.
CREATE INDEX IF NOT EXISTS idx_follow_requests_target
  ON follow_requests (target_id, created_at DESC);

-- E o perfil pergunta "já pedi a esta pessoa?" a cada visita.
CREATE INDEX IF NOT EXISTS idx_follow_requests_requester
  ON follow_requests (requester_id, target_id);
