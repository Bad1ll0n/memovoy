-- O resultado do Nominatim é mesmo o sítio que pedimos?
--
-- Procurar "St. Peter's Basilica, Roma, Itália" devolve a Basílica de San
-- Pietro in Vincoli — outra igreja, a 1,5 km, com horário de abertura próprio.
-- A verificação de distância não apanha isto: 1,5 km está muito dentro dos
-- 150 km que servem para excluir outro continente.
--
-- Para um pino no mapa, 1,5 km é um erro que se vê e se perdoa. Para um horário
-- não é: passaríamos a dizer que a Basílica de São Pedro fecha às 12:30 porque
-- é a essa hora que fecha uma igreja diferente. Um horário errado é pior do que
-- nenhum, porque quem o lê não tem como saber que está errado.
--
-- O `namedetails=1` do Nominatim traz todos os nomes do sítio, em todas as
-- línguas, no mesmo pedido. Comparar o que pedimos com esses nomes separa os
-- casos: "Capitoline Museums" bate com o name:en; "St. Peter's Basilica" não
-- bate com "Saint Peter in Chains".
--
-- FALSE por omissão, e por isso os lugares já em cache ficam por confirmar —
-- que é a verdade: foram guardados antes de haver comparação. Os horários deles
-- deixam de ser usados até serem procurados outra vez.

ALTER TABLE lugares
  ADD COLUMN IF NOT EXISTS nome_confirmado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lugares.nome_confirmado IS
  'TRUE quando o nome devolvido pelo Nominatim corresponde ao que foi procurado. O horário só é usado quando isto é TRUE.';
