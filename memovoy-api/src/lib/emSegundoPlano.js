/**
 * Trabalho que continua depois de a resposta ter saído.
 *
 * A app está cheia de escritas deste género:
 *
 *     query('UPDATE users SET score = score + 10 WHERE id = $1', [id]).catch(() => {})
 *
 * É a decisão certa para o utilizador — ninguém deve esperar meio segundo a
 * mais para que a pontuação suba. Mas cria trabalho que a app não sabe que tem,
 * e isso morde em dois sítios.
 *
 * Nos testes: o limparBaseDeDados faz DELETE FROM users, e um destes updates
 * que ainda vinha a caminho chega depois e rebenta numa chave estrangeira. A
 * falha aparece uma vez em cada quatro ou cinco corridas, sempre noutro teste,
 * e nunca no que a causou — que é a pior espécie de teste intermitente, porque
 * manda quem a investiga para o sítio errado.
 *
 * Em produção: ao receber SIGTERM, o servidor fecha e leva consigo tudo o que
 * estava em voo. São pontuações, contagens de vistas e emblemas — nada crítico
 * isoladamente, mas perde-se em silêncio e ninguém percebe porquê.
 *
 * Registar as promessas resolve os dois com a mesma linha.
 */

const emVoo = new Set()

/**
 * Regista uma promessa que vai continuar depois da resposta.
 *
 * Engole os erros de propósito, tal como o `.catch(() => {})` que substitui:
 * uma pontuação que não subiu não pode derrubar um pedido que já foi entregue
 * com sucesso. O que muda é que agora dá para esperar por ela.
 *
 * @param {Promise<unknown>} promessa
 * @param {(erro: Error) => void} [aoFalhar] para quem quiser registar o erro
 */
export function emSegundoPlano(promessa, aoFalhar) {
  const p = Promise.resolve(promessa)
    .catch((erro) => { if (aoFalhar) aoFalhar(erro) })
    .finally(() => emVoo.delete(p))

  emVoo.add(p)
  return p
}

/**
 * Espera que o trabalho pendente termine.
 *
 * Em ciclo porque uma tarefa pode lançar outra — o checkItineraryBadges corre
 * uma consulta e só depois decide se escreve o emblema. Esperar uma vez só
 * apanharia a primeira metade.
 *
 * @param {number} maxCiclos guarda contra uma cadeia que nunca fecha
 */
export async function aguardarSegundoPlano(maxCiclos = 10) {
  for (let i = 0; i < maxCiclos && emVoo.size > 0; i++) {
    await Promise.allSettled([...emVoo])
  }
  return emVoo.size === 0
}

/** Quantas tarefas estão em voo. Para diagnóstico e para os testes. */
export function pendentesEmSegundoPlano() {
  return emVoo.size
}
