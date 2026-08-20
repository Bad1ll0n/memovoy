-- Separar "onde estive" de "onde vou estar".
--
-- O que a app publica não é só conteúdo, é paradeiro. Um roteiro público
-- devolve start_date e end_date, e nada impede que sejam futuras — o que está
-- publicado nesse caso é "a minha casa está vazia de 3 a 11 de Novembro".
-- Os check-ins de uma viagem a decorrer dizem o mesmo por outra via.
--
-- Até agora isto estava tudo debaixo do mesmo interruptor, o is_private, que é
-- tudo-ou-nada e obriga a uma escolha que ninguém quer fazer: ou mostras as
-- viagens, ou escondes a conta inteira e deixas de contribuir para o explorar
-- e para os rankings. São dois tipos de informação com riscos diferentes.
--
-- A regra passa a ser temporal e não precisa de configuração nenhuma: as datas
-- de uma viagem que já terminou são públicas, porque nessa altura já são uma
-- história; as de uma viagem a decorrer ou por vir só se mostram ao autor e a
-- quem o segue. Protege por omissão quem nunca pensou no assunto, que é a
-- maioria.
--
-- Esta coluna é a saída para quem quer o contrário — anunciar uma viagem antes
-- de ir, para combinar com gente pelo caminho. Fica em FALSE por omissão de
-- propósito: a escolha de publicar uma ausência tem de ser feita, não herdada.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS share_upcoming_trips BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.share_upcoming_trips IS
  'TRUE = as datas de viagens por terminar são visíveis para toda a gente. '
  'FALSE (omissão) = só para o autor e para quem o segue.';
