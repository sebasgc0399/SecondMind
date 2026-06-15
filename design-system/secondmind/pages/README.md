# Reglas de diseño por página

Convención de override del design system de SecondMind.

Si existe `design-system/secondmind/pages/<nombre-pagina>.md`, sus reglas **sobrescriben** las de [`../MASTER.md`](../MASTER.md) y el criterio de [`.claude/design-principles.md`](../../../.claude/design-principles.md) para esa pantalla específica. Precedencia: **page > MASTER**.

El agente `design-review` y el slash `/design-review` consultan este directorio: si hay un archivo para la pantalla bajo revisión, esa es la vara; si no, usan `.claude/design-principles.md` (tokens factuales + decisiones `TODO-Sebastián`) y MASTER como referencia suelta.

Hoy **no hay overrides por página** — este README es el placeholder que documenta la convención y evita una referencia colgante. Agregá `<pagina>.md` (ej. `dashboard.md`, `editor.md`) cuando una pantalla necesite reglas propias.
