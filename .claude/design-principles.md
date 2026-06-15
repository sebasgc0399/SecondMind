# Design Principles — SecondMind

> **Propósito.** Documento de criterio que consume el agente `design-review` (y el slash `/design-review`)
> para auditar UI/UX contra el lenguaje de diseño **real** de SecondMind, no contra estándares genéricos.

## Fuente de verdad

- **Tokens vigentes = [`src/index.css`](../src/index.css)** (`@theme inline` + `:root`/`.dark`). Es lo que corre en producción y la **única fuente de verdad factual** de colores, radios, fuente y tipografía.
- **Criterio de diseño = las decisiones de las secciones 2–6 de este archivo** (definidas, no abiertas). El agente mide los hallazgos contra ellas. Lo que sigue siendo factual del código está marcado **Factual** en cada sección; lo demás es **Criterio**.
- Si existe `design-system/secondmind/pages/[page].md`, esa regla **manda** sobre esa pantalla (precedencia: page > este doc).

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

**Criterio — jerarquía global (chrome, fuera del editor; el editor conserva su escala factual de arriba):**

- **Títulos de página:** 1.25–1.5rem / weight 600. **Headers de sección:** ~1rem / 600.
- **Body y texto de card:** 0.875rem (14px) / 400. **Meta y captions:** 0.75rem (12px) en `muted-foreground`.
- **Line-height del chrome:** 1.4–1.5 (más denso que el 1.7 del editor).
- `letter-spacing` leve negativo (**−0.01 a −0.02em**) en headings grandes.
- `tabular-nums` **SÍ** en stats, counters y tablas (números de cards, `linkCount`, etc.).

---

## 3. Spacing y densidad

**Factual:** el código **no** define tokens `--space-*`; usa la escala default de Tailwind v4 (múltiplos de `0.25rem` / 4px) vía utilities (`p-4`, `gap-2`…).

**Criterio — densidad y ritmo:**

- **Densidad objetivo: POWER-TOOL DENSO con _restraint_.** Vara: **Linear** (primaria) + **Raycast** (secundaria). Densidad alta con ritmo **CONSISTENTE** — no apretado-de-Excel. Este es el blanco para que el agente distinga **"spacing inconsistente"** (hallazgo) de **"denso a propósito"** (correcto).
- Base 4px (Tailwind default, ya vigente). **Ritmo canónico:** gap entre cards `gap-3`/`gap-4`; entre secciones `gap-6`/`gap-8`; padding de card `p-4` desktop / `p-3` mobile; padding de página `1.5rem` desktop / `1rem` mobile.
- **Tap target mínimo en mobile: 44px.**

---

## 4. Color y uso

**Factual (reglas derivables del código):**

- Acento **monocromático violeta** (hue 285): `--primary` para CTAs, links, wikilinks, estados activos, fills del graph.
- Wikilinks: fondo `color-mix(in oklch, var(--primary) 12%, transparent)`, hover 22%, prefijo `@` a `opacity 0.6`.
- Links del editor: subrayado `text-decoration-color` `--primary` 40% → 80% en hover.
- Destructive (rojo) = errores/delete.

**Criterio — uso:**

- **`success`/`warning`: AUSENCIA INTENCIONAL (YAGNI).** El agente **NO** debe reportar su falta como gap. Si se necesita un "éxito" puntual, derivar ad-hoc del chart verde (hue 155).
- **"Un CTA primary por vista": guía blanda** (ayuda a la jerarquía), **NO blocker**.
- **Contraste:** AA **4.5:1 = [Blocker]**; AAA **7:1 = [Nit]**/aspiracional.

---

## 5. Motion

**Factual:** transiciones puntuales `0.15s ease` (wikilinks, links del editor). **No** existen tokens `--ease-*`/`--duration-*` ni un `@media (prefers-reduced-motion)` global en `index.css`.

**Criterio — motion:**

- **Easing canónico:** `cubic-bezier(0.16,1,0.3,1)`. **Durations:** 150ms (micro: hover/toggle), 250ms (modales/drawers), 400ms (layout). **NO usar 600ms.** Nada de bounce ni motion decorativo.
- **`prefers-reduced-motion`:** regla declarada. **HOY no hay reset global → es un GAP REAL de accesibilidad; el agente DEBE marcarlo** hasta que se implemente. (Distinto de `success`/`warning`, que es "no marcar".)
- Respetar los gotchas de animación de chrome existentes (`useMountedTransition`, `useLayoutEffect` pre-paint).

---

## 6. Estética de referencia y anti-patrones

**Criterio — vara de medición:**

- **Vara externa: Linear (primaria) + Raycast (secundaria).** Power-tool para devs/creativos; **NO** consumer/gaming/corporate. Destilar, no copiar. _(Descartadas como vara de medición: Obsidian, Notion, Craft.)_
- **Pantalla gold-standard interna:** _TODO menor — a definir tras el primer `/design-review`._
- **Punto fino del purple `#878bf9`:** es acento de **MARCA**, usado con intención y parsimonia (CTAs, links, estados activos, fills del graph). **NO es gradiente decorativo.** El agente **NO** debe confundirlo con el anti-patrón "gradiente morado AI-default" ni marcarlo como _slop_ por ser violeta.

**Anti-patrones (canon — el agente los reporta como hallazgos):**

- Emojis como iconos funcionales (usar **Lucide**; escala y stroke en §7) · `transform: scale` en hover de cards · sombras fuertes en dark · gradientes decorativos brillantes · `#fff`/`#000` puros en dark · animaciones decorativas / bounce · **spinners** (usar skeletons — coincide con gotcha universal del repo) · tooltips inmediatos · FAB · bottom-tabs en desktop · modales para acciones rápidas (preferir inline editing) · scroll infinito sin señalizar fin · dropdowns con scrollbar (>~8 ítems).

---

## 7. Iconografía

**Factual (verificado en el código):**

- Familia: **Lucide** (`lucide-react`) — 75 imports en 73 archivos, biblioteca única.
- **`strokeWidth`: el código usa el _default_ de Lucide (2).** No hay override global a 1.5; única excepción `NoteCard` (estrella de favorito: `strokeWidth={isFavorite ? 1.5 : 2}`). El "stroke 1.5" del design system histórico **no está aplicado**.
- Tamaño: vía clases Tailwind `w-N h-N` (el prop `size=` de Lucide **no se usa**). Distribución real:

| Clase         | px  | Usos  | Uso típico                                  |
| ------------- | --- | ----- | ------------------------------------------- |
| `w-3 h-3`     | 12  | 29    | micro: chips, badges, sugerencias densas    |
| `w-3.5 h-3.5` | 14  | ~20   | **drift** (paso no-canónico)                |
| `w-4 h-4`     | 16  | 76    | **default** (inline, botones, items)        |
| `w-5 h-5`     | 20  | 7     | headers de sección, botones grandes         |
| `w-6 h-6`     | 24  | 5     | FAB, empty-states grandes                   |
| `w-8 h-8`     | 32  | pocos | iconos de empty-state (Trash2/Search/Brain) |
| `w-10 h-10`   | 40  | 1     | check de captura (celebración puntual)      |

**Criterio:**

- **Escala canónica:** **16px (`w-4`) default** (inline, botones, items de lista) · **20px (`w-5`)** headers de sección / botones grandes · **24px (`w-6`)** FAB y empty-states grandes · **12px (`w-3`)** micro-iconos en chips/badges densos (tier establecido, 29 usos). 32px reservado a iconos de empty-state.
- **`strokeWidth`: decisión abierta.** Intent histórico = 1.5 ("más fino en dark"); realidad = default 2. Hasta resolverlo, el agente lo trata como **observación**, no blocker.
- **Drift que el agente DEBE reportar:** **`w-3.5`/`h-3.5` (14px)** — paso no-canónico (~20 usos), debería migrar a `w-3` (12) o `w-4` (16); y cualquier tamaño suelto fuera de {12, 16, 20, 24} (ej. el 40px aislado).
- Color del icono: `currentColor` (hereda del contexto vía `text-*`).

---

## Cómo usa esto el agente `design-review`

1. Compara hallazgos contra los **tokens factuales** (sección 1) — color/spacing/radius fuera del sistema = hallazgo.
2. Mide contra el **criterio definido** (secciones 2–7): jerarquía del chrome, densidad power-tool densa-con-restraint, color/uso, motion, anti-patrones, iconografía.
3. Respeta las decisiones explícitas: **no** marcar la ausencia de `success`/`warning`; **sí** marcar el gap de `prefers-reduced-motion`; **no** confundir el violeta de marca con _slop_.
4. Si existe regla por página en `design-system/secondmind/pages/`, esa manda.
