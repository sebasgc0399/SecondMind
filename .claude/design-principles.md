# Design Principles — SecondMind

> **Propósito.** Documento de criterio que consume el agente `design-review` (y el slash `/design-review`)
> para auditar UI/UX contra el lenguaje de diseño **real** de SecondMind, no contra estándares genéricos.

## Fuente de verdad

- **Tokens vigentes = [`src/index.css`](../src/index.css)** (`@theme inline` + `:root`/`.dark`). Es lo que corre en producción y la **única fuente de verdad factual** de colores, radios, fuente y tipografía.
- **Criterio de diseño = los bloques `TODO-Sebastián` de este archivo.** Las decisiones de jerarquía, densidad, motion y estética de referencia las define Sebastián; hasta entonces el agente **señala la pregunta abierta**, no inventa un estándar.
- [`design-system/secondmind/MASTER.md`](../design-system/secondmind/MASTER.md) es **referencia histórica suelta, no canon** (fue una referencia rápida generada en 2026-04-10 y ya divergió del código). Se cita abajo solo como punto de partida de ideas; **no es vara de medición**. Si existe `design-system/secondmind/pages/[page].md`, esa regla sí manda sobre esa pantalla.

> El código y MASTER divergen (fuente Geist vs Inter, hue 285 vs 270, base light vs dark, tokens `--space-*`/`--ease-*`/`--accent-success` que MASTER lista pero el CSS no implementa). **Por eso MASTER no se usa como criterio** — ante cualquier duda, gana `src/index.css`. El agente nunca debe reportar el código como "incorrecto" por no coincidir con MASTER.

---

## 1. Tokens (auto-poblado de `src/index.css` — factual)

### Color — `:root` (light, base) vs `.dark` (override)

Todos los colores son `oklch()`, hue **285** (violeta) salvo destructive (rojo) y los charts/graph multicolor. Ancla de marca: `#878bf9` ≈ `--primary` dark.

| Token                  | Light (`:root`)              | Dark (`.dark`)                           |
| ---------------------- | ---------------------------- | ---------------------------------------- |
| `--background`         | `oklch(0.995 0.005 285)`     | `oklch(0.15 0.012 285)`                  |
| `--background-deep`    | `oklch(0.85 0.02 285 / 0.6)` | `oklch(0.08 0.01 285 / 0.85)`            |
| `--foreground`         | `oklch(0.18 0.02 285)`       | `oklch(0.97 0.008 285)`                  |
| `--card` / `--popover` | `oklch(1 0 0)`               | `oklch(0.2 0.015 285)`                   |
| `--card-foreground`    | `oklch(0.18 0.02 285)`       | `oklch(0.97 0.008 285)`                  |
| `--primary`            | `oklch(0.5 0.12 285)`        | `oklch(0.68 0.12 285)` ← ancla `#878bf9` |
| `--primary-foreground` | `oklch(0.99 0 0)`            | `oklch(0.15 0.012 285)`                  |
| `--secondary`          | `oklch(0.96 0.015 285)`      | `oklch(0.27 0.025 285)`                  |
| `--muted`              | `oklch(0.96 0.01 285)`       | `oklch(0.26 0.02 285)`                   |
| `--muted-foreground`   | `oklch(0.5 0.025 285)`       | `oklch(0.68 0.025 285)`                  |
| `--accent`             | `oklch(0.94 0.025 285)`      | `oklch(0.28 0.04 285)`                   |
| `--accent-foreground`  | `oklch(0.25 0.04 285)`       | `oklch(0.97 0.01 285)`                   |
| `--destructive`        | `oklch(0.577 0.245 27.325)`  | `oklch(0.704 0.191 22.216)`              |
| `--border`             | `oklch(0.9 0.015 285)`       | `oklch(1 0 0 / 10%)`                     |
| `--border-strong`      | `oklch(0.8 0.02 285)`        | `oklch(0.35 0.025 285)`                  |
| `--input`              | `oklch(0.9 0.015 285)`       | `oklch(1 0 0 / 15%)`                     |
| `--ring`               | `oklch(0.6 0.11 285)`        | `oklch(0.58 0.1 285)`                    |

**Charts:** `--chart-1..5` = `0.55 0.14 285` (violeta) · `0.6 0.13 155` (verde) · `0.66 0.14 75` (ámbar) · `0.58 0.14 260` (azul) · `0.65 0.14 25` (rojo-naranja). En dark suben ~+0.1–0.12 de lightness.

**Graph:** `--graph-project` `oklch(0.58 0.14 260)` azul · `--graph-area` `oklch(0.6 0.13 155)` verde · `--graph-resource` `oklch(0.66 0.14 75)` ámbar · `--graph-archive`/`--graph-default` grises hue 285.

### Radius (`@theme`, base `--radius: 0.625rem` = 10px)

`--radius-sm` ~6px (·0.6) · `--radius-md` ~8px (·0.8) · `--radius-lg` 10px · `--radius-xl` ~14px (·1.4) · `--radius-2xl` ~18px (·1.8) · `--radius-3xl` ~22px (·2.2) · `--radius-4xl` ~26px (·2.6).

### Tipografía (tokens `@theme`)

- `--font-sans: 'Geist Variable', sans-serif` · `--font-heading: var(--font-sans)` → headings y body comparten familia (**Geist**).

### Sombra

- `--shadow-modal`: light `0 20px 40px -8px oklch(0.3 0.04 285 / 0.22)` · dark `0 20px 40px -8px oklch(0 0 0 / 0.55)`. **Único token de sombra custom**; el resto es elevación por background/border.

### Safe-area (nativo Tauri/Capacitor)

- `--sai-top/-bottom/-left/-right` vía `env(safe-area-inset-*)`; el `body` ya aplica padding horizontal. UI fija debe respetarlos en mobile/native.

---

## 2. Tipografía y jerarquía

**Factual (editor `.note-editor .ProseMirror` en `src/index.css`):**

| Elemento     | Tamaño     | Weight | Line-height           |
| ------------ | ---------- | ------ | --------------------- |
| Body de nota | `1rem`     | 400    | `1.7`                 |
| H1           | `1.875rem` | 700    | `1.2`                 |
| H2           | `1.5rem`   | 600    | `1.25`                |
| H3           | `1.25rem`  | 600    | `1.3`                 |
| Code inline  | `0.875em`  | —      | mono (`ui-monospace`) |

- Ancho de lectura del editor: **`max-width: 720px`** centrado.

> **TODO-Sebastián — criterio de tipografía y jerarquía global:**
>
> - Confirmar la escala canónica **fuera** del editor (dashboard, headers de página, cards): tamaños/weights de H1/H2/H3 y body.
> - ¿`letter-spacing` negativo en headings? ¿`tabular-nums` en stats/tablas? (Hoy no están en `index.css`.)

---

## 3. Spacing y densidad

**Factual:** el código **no** define tokens `--space-*`; usa la escala default de Tailwind v4 (múltiplos de `0.25rem` / 4px) vía utilities (`p-4`, `gap-2`…).

> **TODO-Sebastián — criterio de spacing y densidad:**
>
> - **Densidad objetivo:** ¿compacta (power-tool, alta densidad) o más aireada? El agente necesita un blanco para distinguir "spacing inconsistente" de "denso a propósito".
> - Ritmo vertical canónico (gap entre cards, entre secciones, padding de página por breakpoint) y tap target mínimo en mobile.

---

## 4. Color y uso (parcial + TODO)

**Factual (reglas derivables del código):**

- Acento **monocromático violeta** (hue 285): `--primary` para CTAs, links, wikilinks, estados activos, fills del graph.
- Wikilinks: fondo `color-mix(in oklch, var(--primary) 12%, transparent)`, hover 22%, prefijo `@` a `opacity 0.6`.
- Links del editor: subrayado `text-decoration-color` `--primary` 40% → 80% en hover.
- Destructive (rojo) = errores/delete. **No** existen tokens semánticos success/warning.

> **TODO-Sebastián — criterio de color y uso:**
>
> - ¿Se introducen tokens semánticos `success`/`warning` (hoy ausentes) o se derivan ad-hoc de chart colors?
> - ¿"Un solo CTA primary por vista" es regla dura? Umbral de contraste a reportar como blocker (AA 4.5:1 vs AAA 7:1).

---

## 5. Motion (TODO)

**Factual:** transiciones puntuales `0.15s ease` (wikilinks, links del editor). **No** existen tokens `--ease-*`/`--duration-*` ni un `@media (prefers-reduced-motion)` global en `index.css`.

> **TODO-Sebastián — criterio de motion:**
>
> - Definir easing/duración canónicos (entrada de modales, slides de sidebar/drawer). El repo ya tiene gotchas de animación de chrome (`useMountedTransition`, `useLayoutEffect` pre-paint) que el agente debe respetar.
> - **`prefers-reduced-motion`:** confirmar dónde se respeta; si no hay reset global, es un gap de accesibilidad a marcar.
> - _(Referencia suelta, no canon — de MASTER.md: easing `cubic-bezier(0.16,1,0.3,1)`, durations 150/250/400/600ms. Confirmar si se adopta.)_

---

## 6. Estética de referencia y anti-patrones

> **TODO-Sebastián — definir la vara de medición:**
>
> - **Estética concreta:** elegir 1–2 pantallas "gold standard" del propio SecondMind (o screenshots de referencia) que el agente use como blanco, en vez de solo principios abstractos.
> - Confirmar referencias vigentes y anti-patrones aplicables.

**Punto de partida sugerido (de MASTER.md — referencia suelta, confirmá; el agente lo usa como hipótesis, no como canon):**

- _Referencias:_ Linear · Obsidian · Raycast · Craft Docs · Notion dark. Power-tool para developers/creativos — no consumer/gaming/corporate. Destilar, no copiar.
- _Anti-patrones candidatos:_ emojis como iconos funcionales (usar Lucide, stroke 1.5) · `transform: scale` en hover de cards · sombras fuertes en dark · gradientes decorativos brillantes · `#fff`/`#000` puros en dark · animaciones decorativas / bounce en productivity · **spinners** (usar skeletons — coincide con gotcha universal del repo) · tooltips inmediatos · FAB · bottom-tabs en desktop · modales para acciones rápidas (preferir inline editing) · scroll infinito sin señalizar fin · dropdowns con scrollbar (max ~8 items).

---

## Cómo usa esto el agente `design-review`

1. Compara hallazgos contra los **tokens factuales** (sección 1) — color/spacing/radius fuera del sistema = hallazgo.
2. Para criterio abierto (bloques `TODO-Sebastián`), **señala la pregunta** en vez de inventar un estándar.
3. Si existe regla por página en `design-system/secondmind/pages/`, esa manda. MASTER.md es solo referencia suelta.
