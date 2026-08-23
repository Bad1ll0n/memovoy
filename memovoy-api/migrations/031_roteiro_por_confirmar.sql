-- Um roteiro gerado ainda não é um roteiro.
--
-- O ecrã de revisão diz "decide se queres guardar", mas a decisão já estava
-- tomada: a rota gravava antes de responder, e sem tocar em is_public — que é
-- TRUE por omissão. O roteiro nascia PÚBLICO. Aparecia na lista do utilizador,
-- na pesquisa e no explorar, tudo antes de alguém carregar em "Guardar".
--
-- Quem gerasse e descartasse tinha o roteiro visível para toda a gente durante
-- a revisão. E "Guardar Roteiro" não gravava nada: só navegava para a página.
--
-- ── Porquê duas colunas e não uma ───────────────────────────────────────────
--
-- `confirmado` diz se o utilizador chegou a aceitar o roteiro.
-- `is_public` diz quem o pode ver.
--
-- São perguntas diferentes: um roteiro confirmado pode ser privado, e é uma
-- escolha legítima. Juntá-las numa só coluna impedia isso.
--
-- Enquanto por confirmar, a rota grava com is_public = FALSE. Isso é de
-- propósito e é a parte que evita fugas: os vinte e quatro sítios que lêem
-- roteiros já respeitam is_public e já foram testados. Não é preciso lembrar
-- nenhum deles de uma regra nova — e uma regra nova esquecida num deles era
-- exactamente a fuga que isto quer impedir.

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS confirmado BOOLEAN NOT NULL DEFAULT TRUE;

-- TRUE por omissão, e por isso os roteiros que já existem ficam confirmados.
-- É verdade: foram criados quando não havia passo de revisão, portanto ninguém
-- os deixou por decidir. Só a geração é que passa a gravar FALSE, à mão.

COMMENT ON COLUMN itineraries.confirmado IS
  'FALSE enquanto o utilizador ainda está a rever o roteiro acabado de gerar. Nesse estado is_public é FALSE e o roteiro não aparece em lado nenhum.';

-- Para encontrar rascunhos abandonados sem varrer a tabela.
--
-- Quem fecha o separador a meio da revisão deixa uma linha invisível para
-- sempre. São poucas e pequenas, mas acumulam, e sem este índice a pergunta
-- "o que ficou por confirmar?" fica cara justamente quando houver muitas.
CREATE INDEX IF NOT EXISTS idx_itineraries_por_confirmar
  ON itineraries (created_at)
  WHERE confirmado = FALSE;
