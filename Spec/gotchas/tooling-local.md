# Tooling local

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Helpers compartidos existentes

`formatDate`, `startOfDay`, `isSameDay`, `getWeekStart`, `addDays` en [`src/lib/dateUtils.ts`](../../src/lib/dateUtils.ts); `parseIds`, `stringifyIds` en [`src/lib/tinybase.ts`](../../src/lib/tinybase.ts).

## `vi.mock(...)` se hoistea al top del archivo de test por Vitest

Vars del scope no son accesibles desde el factory en tiempo de evaluación. Si el mock necesita un objeto compartido (ej. un store TinyBase de testing), crearlo DENTRO del factory con `await import()` y leerlo desde el módulo mockeado en el resto del archivo. Y porque ESLint `import/order` interpreta `vi.mock(...)` como statement separador entre import groups, **todos los imports al top del archivo + `vi.mock` después** (Vitest los hoistea igual). Imports antes y después de un `vi.mock` reportan "empty line between import groups". Patrón vivo en [src/infra/repos/notesRepo.test.ts](../../src/infra/repos/notesRepo.test.ts).

## TypeScript LSP plugin requiere patch en Windows

`child_process.spawn()` no resuelve wrappers `.cmd` de npm global. Fix: `marketplace.json` con `command: "node"` + ruta absoluta a `cli.mjs`. Procedimiento en `../../Docs/SETUP-WINDOWS.md`.

## Firebase MCP: `node` directo al CLI local, no `npx`

`npx firebase@latest` falla con "Invalid Version". Configurado en `.mcp.json`.

## Brave Search: `BRAVE_API_KEY` como variable de sistema Windows

No en `.env.local`.

## ui-ux-pro-max symlinks rotos en Windows

Sin Developer Mode. Scripts reales en `src/ui-ux-pro-max/scripts/search.py`. Fix: Developer Mode + `git config --global core.symlinks true` + reinstalar plugin.
