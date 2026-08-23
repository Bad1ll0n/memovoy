-- Os horários de abertura, ao lado das coordenadas.
--
-- Numa geração real apareceram os Museus do Vaticano marcados para as 18:05.
-- Fecham às 18:00. O modelo não tem forma fiável de saber isto, e perguntar-lhe
-- seria pedir-lhe que se verificasse a si próprio.
--
-- O OpenStreetMap tem a etiqueta `opening_hours` em quase todos os museus e
-- monumentos, e o Nominatim devolve-a no MESMO pedido que já fazemos para
-- geocodificar — basta pedir `extratags=1`. É dado real, mantido por quem
-- conhece o sítio, e não custa uma chamada a mais.
--
-- Exemplos verdadeiros, obtidos ao construir isto:
--
--   Panteão            Mo-Sa 08:30-19:15; Su 09:00-17:45
--   Galleria Borghese  Tu-Su 09:00-19:00          ← fechada à segunda-feira
--   Coliseu            Nov 01-Feb 15: 08:30-16:30; Apr-Aug: 08:30-19:15; ...
--
-- Fica em texto, exactamente como vem. Interpretar antes de guardar era perder
-- informação que ainda não sabemos ler: a especificação tem feriados, horas
-- relativas ao pôr-do-sol e semanas do mês, e o que hoje é descartado pode
-- passar a ser compreendido sem ter de voltar a perguntar ao Nominatim.

ALTER TABLE lugares
  ADD COLUMN IF NOT EXISTS horario TEXT;

COMMENT ON COLUMN lugares.horario IS
  'A etiqueta opening_hours do OpenStreetMap, em bruto. NULL quando o sítio não a tem ou quando foi guardado antes de a passarmos a pedir.';

-- Para saber de quantos lugares já se conhece o horário sem varrer a tabela.
-- É a métrica que diz se vale a pena confiar nesta verificação.
CREATE INDEX IF NOT EXISTS idx_lugares_com_horario
  ON lugares (estado)
  WHERE horario IS NOT NULL;
