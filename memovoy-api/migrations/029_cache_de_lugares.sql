-- Cache global de geocodificação.
--
-- A resolução de coordenadas acontecia no browser, a cada visita, sem cache
-- nenhuma. Um roteiro de três dias com doze actividades por dia fazia 39
-- pedidos ao Nominatim por visita — e os mesmos 39 outra vez ao visitante
-- seguinte. Quinhentas visitas davam quase vinte mil pedidos pelos mesmos
-- lugares.
--
-- O Nominatim é um serviço comunitário gratuito com política de utilização, e
-- isto violava-a por larga margem. Além disso o utilizador esperava catorze
-- segundos pelo mapa, porque a política obriga a um pedido por segundo.
--
-- Passa a ser resolvido no servidor, uma vez, e guardado aqui. "Edinburgh
-- Castle" resolve-se uma vez na vida da aplicação, para todos os utilizadores.
--
-- A chave inclui a cidade e o país porque o nome de um lugar só é único dentro
-- de uma cidade: "Old Town" em Edimburgo e "Old Town" em Praga são dois
-- lugares diferentes e têm de ser duas linhas.

CREATE TABLE IF NOT EXISTS lugares (
  chave        TEXT PRIMARY KEY,
  lat          DOUBLE PRECISION,
  lon          DOUBLE PRECISION,
  -- O nome que o Nominatim devolveu. Guardado para se poder auditar o que a
  -- cache aprendeu sem ter de repetir os pedidos.
  nome_obtido  TEXT,

  -- Guardar as falhas também.
  --
  -- Sem isto, um nome que o modelo inventa e que não existe em lado nenhum é
  -- procurado de novo em cada geração, para sempre. São os casos mais caros
  -- (esgotam o tempo) e os que nunca vão resolver.
  --
  -- 'ok'          resolvido
  -- 'sem_resposta' o Nominatim não encontrou nada
  -- 'longe'        encontrou, mas longe de mais do destino para ser plausível
  estado       TEXT NOT NULL DEFAULT 'ok',

  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lugares_estado_valido CHECK (estado IN ('ok', 'sem_resposta', 'longe')),
  -- Um lugar resolvido tem de ter coordenadas; um falhado não pode ter.
  CONSTRAINT lugares_coerentes CHECK (
    (estado = 'ok' AND lat IS NOT NULL AND lon IS NOT NULL) OR
    (estado <> 'ok' AND lat IS NULL AND lon IS NULL)
  )
);

-- Para responder à pergunta "o que é que falha mais?" sem varrer a tabela.
-- É esta consulta que transforma a cache num registo de problemas de graça.
CREATE INDEX IF NOT EXISTS idx_lugares_falhados
  ON lugares (estado, criado_em DESC)
  WHERE estado <> 'ok';
