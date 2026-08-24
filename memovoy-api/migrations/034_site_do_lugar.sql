-- O site oficial de cada lugar, para quem quer comprar bilhete.
--
-- Pediram "onde comprar os bilhetes ao melhor preço". Não há forma honesta de
-- garantir o melhor preço: os revendedores mudam-no ao dia e não temos como
-- comparar. O que há é o site OFICIAL, que vende a preço de bilheteira e sem a
-- margem que um intermediário acrescenta — e o OpenStreetMap tem-no.
--
-- Verificado ao construir isto, cinco em seis dos lugares pagos de Roma:
--
--   Coliseu             parcocolosseo.it
--   Museus Vaticanos    museivaticani.va
--   Galleria Borghese   galleriaborghese.beniculturali.it
--   Museus Capitolinos  museicapitolini.org
--   Panteão             pantheonroma.org
--
-- Vem no mesmo pedido que já fazemos, ao lado das coordenadas e do horário.
-- Não custa uma chamada a mais.

ALTER TABLE lugares
  ADD COLUMN IF NOT EXISTS site TEXT;

COMMENT ON COLUMN lugares.site IS
  'O site oficial do lugar, da etiqueta website do OpenStreetMap. Usado só quando nome_confirmado é TRUE — o site do sítio errado é pior do que nenhum.';
