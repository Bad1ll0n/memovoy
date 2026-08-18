import path from 'node:path'

/**
 * Onde fica guardada a sessão criada pelo projecto `setup`.
 *
 * Módulo próprio porque o Playwright não deixa um ficheiro de teste importar
 * outro — e tanto o auth.setup.ts como as specs precisam deste caminho.
 */
export const FICHEIRO_SESSAO = path.join(__dirname, '.auth', 'utilizador.json')
