-- A que horas começa e acaba cada dia do roteiro.
--
-- O agente escolhia as horas sozinho e assumia sempre o mesmo: começar às 09:00
-- e arrastar-se até à noite. Para quem viaja com crianças, ou chega num voo da
-- tarde, ou simplesmente não se levanta às oito, o roteiro nascia errado e a
-- única forma de o corrigir era editar actividade a actividade.
--
-- Fica guardado na tabela, e não só usado na geração, por duas razões:
--
--   1. O refinamento por conversa ("mete mais uma coisa no dia 2") acontece
--      depois, noutro pedido, e sem isto voltaria a inventar horas fora da
--      janela que o utilizador escolheu.
--   2. Quem abre o roteiro consegue ver com que pressupostos foi feito.
--
-- TIME e não TEXT: a base de dados passa a recusar '25:99', e a comparação
-- entre horas é uma comparação e não uma ordenação de strings.

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS day_start TIME,
  ADD COLUMN IF NOT EXISTS day_end   TIME;

-- Sem valor por omissão nas colunas, de propósito.
--
-- NULL aqui quer dizer "este roteiro é anterior à funcionalidade" e é
-- verdade. Pôr 09:00 em todos os roteiros antigos era inventar uma escolha
-- que o utilizador nunca fez, e depois não havia como distinguir quem
-- escolheu as nove de quem nunca foi perguntado.
--
-- O valor por omissão de quem gera vive na rota, onde se pode explicar.

COMMENT ON COLUMN itineraries.day_start IS
  'Hora a que o utilizador quer começar cada dia. NULL = roteiro anterior à funcionalidade.';
COMMENT ON COLUMN itineraries.day_end IS
  'Hora a que o utilizador quer terminar cada dia. NULL = roteiro anterior à funcionalidade.';
