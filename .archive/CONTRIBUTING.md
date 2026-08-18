# MemoVoy — Estratégia de Branches

## Branches

- `main` — código estável, sempre deployável
- `develop` — integração de features antes de chegar a `main`
- `feature/*` — uma branch por funcionalidade, a partir de `develop`

## Fluxo de trabalho

```bash
# Nova funcionalidade
git checkout develop
git pull
git checkout -b feature/nome-da-feature

# ... trabalho ...

git add -A
git commit -m "descrição clara do que mudou"
git push -u origin feature/nome-da-feature

# Depois de revisto, merge para develop via PR
# Quando develop está estável, merge para main via PR
```

## Convenção de commits

```
tipo: descrição curta no imperativo

Corpo opcional explicando o porquê, não o quê.
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Exemplos:
```
feat: adiciona pesquisa full-text com pg_trgm
fix: corrige serialização de BigInt em COUNT(*)
docs: actualiza README com setup do worker de moderação
```
