/**
 * Strips markup and null bytes from free-text the user typed.
 *
 * Not a substitute for escaping at render time — React already escapes, so this
 * is defence in depth. It matters because the API is not the only possible
 * consumer of this data: an email template, a PDF export or a future component
 * using dangerouslySetInnerHTML would render whatever is stored.
 *
 * Applied to fields where markup is never legitimate — display names, bios,
 * captions, titles. Not applied to anything that may legitimately contain
 * angle brackets.
 *
 * @param {unknown} valor
 * @returns {unknown} The cleaned string, or the input untouched if not a string.
 */
export function limparTextoDoUtilizador(valor) {
  if (typeof valor !== 'string') return valor
  return valor
    .replace(/<[^>]*>/g, '')  // strip anything shaped like a tag
    .replace(/\0/g, '')       // strip null bytes
    .trim()
}

/**
 * Applies limparTextoDoUtilizador to the named keys of an object, leaving the
 * rest untouched. Returns a new object; the input is not mutated.
 *
 * @template {Record<string, unknown>} T
 * @param {T} obj
 * @param {string[]} chaves
 * @returns {T}
 */
export function limparCampos(obj, chaves) {
  const saida = { ...obj }
  for (const chave of chaves) {
    if (chave in saida) saida[chave] = limparTextoDoUtilizador(saida[chave])
  }
  return saida
}
