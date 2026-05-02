# Design System Master — SecondMind

> **LOGIC:** Antes de construir una página específica, revisa primero `design-system/secondmind/pages/[page-name].md`. Si ese archivo existe, sus reglas **sobrescriben** este Master. Si no, seguir estrictamente lo de abajo.

---

**Proyecto:** SecondMind
**Generado:** 2026-04-10
**Categoría:** Productivity Tool + Knowledge Management
**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + TinyBase + Firebase
**Modo primario:** Dark
**Modo secundario:** Light (soportado para accesibilidad)

---

## Filosofía de diseño

SecondMind es una herramienta de conocimiento personal que combina ejecución (tareas, hábitos, proyectos) con pensamiento (notas atómicas, wikilinks, grafo). El diseño debe reflejar **foco, profundidad y precisión** — no entretenimiento.

**Inspiración visual:** Linear, Obsidian, Notion dark mode, Raycast, Craft Docs. Estética de herramientas de poder para developers/creativos. No consumer, no gaming, no corporate flat.

**Principios:**

1. **Contenido primero** — El UI se disuelve, la nota/tarea/idea es la protagonista
2. **Jerarquía por profundidad, no por color** — Usar elevación y transparencia antes que color saturado
3. **Tipografía como columna vertebral** — Inter en múltiples pesos hace el trabajo pesado
4. **Acento monocromático** — Un solo color de acento (indigo) para CTAs y estados activos
5. **Movimiento funcional** — Animaciones solo para feedback, nunca decorativas

---

## Paleta de colores (Dark Mode — Primario)

Basado en **Modern Dark (Cinema)** con acento indigo estilo Linear. Usa `oklch()` para alineación con shadcn/ui.

| Role                       | OKLCH                         | Hex equivalente          | Uso                                          |
| -------------------------- | ----------------------------- | ------------------------ | -------------------------------------------- |
| `--background`             | `oklch(0.09 0.005 270)`       | `#0a0a0c`                | Base de la app                               |
| `--background-deep`        | `oklch(0.05 0.005 270)`       | `#050506`                | Fondo profundo (modales, dropdowns)          |
| `--foreground`             | `oklch(0.93 0.005 270)`       | `#ededef`                | Texto primario                               |
| `--foreground-muted`       | `oklch(0.60 0.010 250)`       | `#8a8f98`                | Texto secundario, placeholders               |
| `--card`                   | `oklch(0.12 0.008 270)`       | `#14141a`                | Cards, paneles de nota                       |
| `--card-foreground`        | `oklch(0.93 0.005 270)`       | `#ededef`                | Texto sobre card                             |
| `--border`                 | `oklch(1 0 0 / 0.08)`         | `rgba(255,255,255,0.08)` | Bordes sutiles (hairlines)                   |
| `--border-strong`          | `oklch(1 0 0 / 0.15)`         | `rgba(255,255,255,0.15)` | Bordes visibles (inputs activos)             |
| `--primary`                | `oklch(0.62 0.18 275)`        | `#5e6ad2`                | CTAs, links, enlaces wikilink, estado activo |
| `--primary-foreground`     | `oklch(0.98 0 0)`             | `#ffffff`                | Texto sobre primary                          |
| `--primary-glow`           | `oklch(0.62 0.18 275 / 0.20)` | `rgba(94,106,210,0.20)`  | Glow sutil detrás de primary                 |
| `--accent-success`         | `oklch(0.72 0.19 150)`        | `#22c55e`                | Hábitos completados, tasks done, positivo    |
| `--accent-warning`         | `oklch(0.78 0.18 75)`         | `#f59e0b`                | Due soon, revisiones pendientes              |
| `--destructive`            | `oklch(0.63 0.22 25)`         | `#ef4444`                | Delete, errores                              |
| `--destructive-foreground` | `oklch(0.98 0 0)`             | `#ffffff`                |                                              |
| `--ring`                   | `oklch(0.62 0.18 275 / 0.40)` | `rgba(94,106,210,0.40)`  | Focus ring                                   |
| `--muted`                  | `oklch(0.18 0.008 270)`       | `#1f2026`                | Hovers, rows alternas, tags                  |
| `--muted-foreground`       | `oklch(0.65 0.010 250)`       | `#9ca0a8`                | Texto sobre muted                            |

### Reglas críticas de color (dark)

- ❌ **NUNCA** usar `#000000` puro como background. Smear en OLED y elimina la posibilidad de elevación.
- ✅ Usar `oklch(0.09 0.005 270)` (`#0a0a0c`) como base. Permite elevar cards con `oklch(0.12 0.008 270)`.
- ❌ **NUNCA** usar texto `#ffffff` puro sobre dark. Genera fatiga visual.
- ✅ Usar `oklch(0.93 0.005 270)` (`#ededef`) para texto primario.
- ✅ Bordes siempre vía `rgba(255,255,255,0.08)` — mantiene jerarquía visual sin color.
- ✅ Glow del accent solo en CTAs primarios y estados hover de elementos críticos (no en todo).

---

## Paleta de colores (Light Mode — Secundario)

Para usuarios que lo prefieran. Mantiene el mismo acento indigo para coherencia de marca.

| Role           | OKLCH                   | Hex                |
| -------------- | ----------------------- | ------------------ |
| `--background` | `oklch(0.99 0.002 270)` | `#fcfcfd`          |
| `--foreground` | `oklch(0.15 0.008 270)` | `#1a1a1f`          |
| `--card`       | `oklch(1 0 0)`          | `#ffffff`          |
| `--border`     | `oklch(0 0 0 / 0.08)`   | `rgba(0,0,0,0.08)` |
| `--primary`    | `oklch(0.55 0.18 275)`  | `#4f5ac4`          |
| `--muted`      | `oklch(0.96 0.003 270)` | `#f4f4f6`          |

---

## Tipografía

**Una sola familia:** Inter Variable. Hace el 100% del trabajo.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
```

### Escala tipográfica

| Token       | Tamaño     | Line height | Weight | Uso                                |
| ----------- | ---------- | ----------- | ------ | ---------------------------------- |
| `text-xs`   | `0.75rem`  | `1rem`      | 500    | Tags, labels, timestamps           |
| `text-sm`   | `0.875rem` | `1.25rem`   | 400    | UI secundario, captions            |
| `text-base` | `1rem`     | `1.5rem`    | 400    | Body text, contenido de notas      |
| `text-lg`   | `1.125rem` | `1.75rem`   | 500    | Subtítulos, CTAs                   |
| `text-xl`   | `1.25rem`  | `1.75rem`   | 600    | Título de nota, panel header       |
| `text-2xl`  | `1.5rem`   | `2rem`      | 600    | Título de página                   |
| `text-3xl`  | `1.875rem` | `2.25rem`   | 700    | Dashboard H1                       |
| `text-4xl`  | `2.25rem`  | `2.5rem`    | 800    | Hero (login, empty states grandes) |

### Reglas tipográficas

- ✅ `font-feature-settings: 'cv11', 'ss01', 'ss03'` para Inter (variantes tipográficas modernas)
- ✅ `letter-spacing: -0.01em` en headings (h1-h3). Inter tight tracking.
- ✅ Body text: `font-weight: 400`, line-height: `1.6-1.7` en notas largas
- ❌ **NUNCA** `text-align: justify` — rompe el flow en viewport variable
- ✅ Tabular numerals (`font-variant-numeric: tabular-nums`) en números de estadísticas y tablas

---

## Spacing

| Token         | Valor  | Uso                                 |
| ------------- | ------ | ----------------------------------- |
| `--space-0.5` | `2px`  | Micro-adjustments                   |
| `--space-1`   | `4px`  | Gap entre icono y texto inline      |
| `--space-2`   | `8px`  | Gap entre chips, tags               |
| `--space-3`   | `12px` | Padding vertical de inputs, botones |
| `--space-4`   | `16px` | Padding de card, gap entre cards    |
| `--space-5`   | `20px` | Gap secciones dentro de un panel    |
| `--space-6`   | `24px` | Padding de página en mobile         |
| `--space-8`   | `32px` | Padding de página en desktop        |
| `--space-12`  | `48px` | Separación entre bloques mayores    |
| `--space-16`  | `64px` | Padding hero                        |

**Regla:** Usar solo estos tokens. No valores arbitrarios.

---

## Radius (Bordes redondeados)

| Token           | Valor    | Uso                                 |
| --------------- | -------- | ----------------------------------- |
| `--radius-sm`   | `6px`    | Chips, tags, inputs pequeños        |
| `--radius`      | `10px`   | Default para cards, buttons, inputs |
| `--radius-md`   | `12px`   | Modals, panels                      |
| `--radius-lg`   | `16px`   | Hero cards, empty states            |
| `--radius-full` | `9999px` | Avatars, badges circulares          |

---

## Elevación (Dark mode — sin sombras tradicionales)

En dark mode, la elevación se logra con **backgrounds progresivamente más claros**, no con `box-shadow`. Las sombras no funcionan bien sobre dark.

| Nivel | Technique                                                                                                      | Uso                          |
| ----- | -------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `0`   | `background: var(--background)`                                                                                | Base                         |
| `1`   | `background: var(--card)` + `border: 1px solid var(--border)`                                                  | Cards, note items            |
| `2`   | `background: var(--card)` + inner glow: `inset 0 1px 0 rgba(255,255,255,0.04)`                                 | Hover state de cards         |
| `3`   | `background: oklch(0.14 0.008 270)` + `backdrop-filter: blur(12px)` + `border: 1px solid var(--border-strong)` | Modales, dropdowns, popovers |
| `4`   | Nivel 3 + `box-shadow: 0 20px 40px rgba(0,0,0,0.5)`                                                            | Floating UI critical         |

---

## Motion (Animaciones)

**Easing signature:** `cubic-bezier(0.16, 1, 0.3, 1)` — Expo out. Es la firma de herramientas modernas (Linear, Framer). **Usar para todas las transiciones que no sean hover simple.**

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Duraciones

| Token               | Valor   | Uso                            |
| ------------------- | ------- | ------------------------------ |
| `--duration-fast`   | `150ms` | Hover states, focus rings      |
| `--duration-base`   | `250ms` | Default transitions            |
| `--duration-slow`   | `400ms` | Modal enter/exit, sheet slides |
| `--duration-slower` | `600ms` | Dashboard reveal, onboarding   |

### Reglas de motion

- ✅ `@media (prefers-reduced-motion: reduce)` — **obligatorio**. Reducir a `duration: 0.01ms` y eliminar `transform`.
- ❌ **Nunca** animar `width`/`height` directamente. Usar `transform: scale()` o `clip-path`.
- ✅ Hover de cards: `transition: background 150ms var(--ease-out), border-color 150ms var(--ease-out)`. **No transform** (evita layout shift).
- ✅ Botones: `transition: background 150ms var(--ease-out), transform 150ms var(--ease-out)`. Pressed state: `transform: scale(0.98)`.
- ✅ Modal enter: `opacity 0→1` + `scale 0.96→1` con `400ms var(--ease-out)`.
- ❌ **Nunca** bounce (spring overshoot) en contexto productivity. Reservar solo para celebración de hábito completado.

---

## Iconografía

**Biblioteca única:** [Lucide React](https://lucide.dev) (`lucide-react` ya instalado).

### Reglas

- ✅ **NUNCA** usar emojis como iconos funcionales. Solo en mensajes de contenido del usuario.
- ✅ Tamaño default: `16px` inline, `20px` para botones grandes, `24px` para icons de navegación
- ✅ `stroke-width: 1.5` (no el default 2 — más fino es más elegante en dark)
- ✅ Color: `currentColor` siempre. Hereda del contexto.
- ❌ No mezclar con otras bibliotecas (no Heroicons, no Feather, no Phosphor)

---

## Component patterns

### Buttons

```tsx
// Primary — CTA principal (un solo primary por pantalla visible)
<button className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] px-4 py-2 rounded-[10px] font-medium text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
  Crear nota
</button>

// Secondary — acciones secundarias
<button className="bg-muted text-foreground hover:bg-muted/80 border border-border px-4 py-2 rounded-[10px] font-medium text-sm transition-colors duration-150">
  Cancelar
</button>

// Ghost — acciones terciarias, iconos
<button className="text-foreground-muted hover:text-foreground hover:bg-muted px-2 py-1 rounded-md transition-colors duration-150">
  <Icon className="w-4 h-4" />
</button>
```

### Cards (note items, task items)

```tsx
<div className="bg-card border border-border rounded-xl p-4 hover:border-border-strong hover:bg-card/80 transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer group">
  <h3 className="text-base font-medium text-foreground group-hover:text-primary transition-colors">
    Título de nota
  </h3>
  <p className="text-sm text-foreground-muted mt-1 line-clamp-2">Preview del contenido...</p>
  <div className="flex gap-2 mt-3">{/* tags */}</div>
</div>
```

### Inputs

```tsx
<input className="bg-card border border-border rounded-[10px] px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none transition-colors duration-150 w-full" />
```

### Modals / Dialogs

```tsx
// Overlay
<div className="fixed inset-0 bg-background-deep/80 backdrop-blur-sm z-50" />

// Modal content
<div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border-strong rounded-2xl p-6 max-w-md w-[90vw] z-50 shadow-[0_20px_40px_rgba(0,0,0,0.5)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-400 data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)]">
  {/* ... */}
</div>
```

### Wikilinks en el editor

```tsx
// Inline wikilink node renderizado por TipTap (extensión wikilink.ts)
// Trigger UI: '@'. El '@' visible se agrega vía CSS pseudo-elemento .wikilink::before
<a className="wikilink" data-note-id="..." data-wikilink="true">
  Nombre de nota
</a>
```

### Tags

```tsx
<span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs font-medium px-2 py-0.5 rounded-md">
  #tag
</span>
```

### Sidebar item (activo vs inactivo)

```tsx
// Inactivo
<a className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-foreground-muted hover:bg-muted hover:text-foreground transition-colors duration-150">
  <Icon className="w-4 h-4" />
  Notas
</a>

// Activo
<a className="flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-muted text-foreground font-medium">
  <Icon className="w-4 h-4 text-primary" />
  Notas
</a>
```

---

## Patrones específicos de SecondMind

### Editor de notas (TipTap)

- Background: `var(--background)` (sin card wrapper — el editor es pantalla completa)
- Max-width del contenido: `720px` centrado (ReadWidth óptimo)
- Font body: `text-base` (1rem / 16px), line-height `1.7`
- Headings usan la escala tipográfica estándar
- Wikilinks: ver component pattern arriba
- Slash command menu: floating panel nivel 3 con backdrop-blur
- Auto-save indicator: badge pequeño top-right con `text-xs text-foreground-muted` — transición a check de `text-accent-success` 600ms después de guardar

### Knowledge Graph

- Background: `var(--background-deep)` (más oscuro que la app — contraste visual)
- Nodos: circles radius 8-16px, `fill: var(--primary)`, `stroke: var(--border-strong)`, `stroke-width: 1.5`
- Nodos con muchas conexiones: radius mayor, `filter: drop-shadow(0 0 8px var(--primary-glow))`
- Edges: `stroke: var(--border)`, `stroke-width: 1`, opacity 0.5
- Hover de nodo: fade out de no conectados a `opacity: 0.3`, highlight conectados con `stroke: var(--primary)`

### Habit tracker grid

- Grid de celdas 14x14px con gap de 3px (inspiración GitHub contributions)
- Intensidad por color: `muted` (0%), `primary/30` (25%), `primary/50` (50%), `primary/75` (75%), `primary` (100%)
- Hover: tooltip con fecha y estado

### Inbox processor

- Layout: stack de cards verticales, gap `space-3`
- Cada inbox item: card nivel 1 con `cursor: grab` (drag para reordenar)
- AI suggestions: badge inline con icono Sparkles (`w-3 h-3 text-primary`) + texto sugerido

### Quick Capture modal

- Modal nivel 3, centrado, `max-w-xl`
- Textarea sin borde (`border-none outline-none`), background igual al modal
- Sin selector de tipo/tags/proyecto (todo al Inbox sin clasificar)
- Bottom bar: `Esc` cancelar, `Cmd+Enter` guardar (keyboard hints con `kbd` elementos)

### Command Palette (Cmd+K)

- Modal centrado top, `max-w-2xl`, offset desde top `space-16`
- Input tipo buscador con `placeholder="Buscar comandos, notas, tareas..."`
- Resultados agrupados por categoría con headers pequeños `text-xs uppercase text-foreground-muted`
- Row seleccionada: `bg-muted`, row hover: `bg-muted/60`

---

## Responsive breakpoints

| Token | Min width | Uso                                                   |
| ----- | --------- | ----------------------------------------------------- |
| `sm`  | `640px`   | Mobile large (landscape phones)                       |
| `md`  | `768px`   | Tablet portrait                                       |
| `lg`  | `1024px`  | Tablet landscape / small desktop — sidebar colapsable |
| `xl`  | `1280px`  | Desktop — sidebar fija                                |
| `2xl` | `1536px`  | Wide desktop — layouts de 3 columnas                  |

**Mobile-first siempre.** Los estilos base son mobile, los breakpoints agregan/ajustan.

### Layouts adaptativos

- **Mobile (< lg):** Sidebar se colapsa a drawer, editor fullscreen, graph simplificado o deshabilitado
- **Desktop (≥ lg):** Sidebar fija 240px, editor con max-width, graph en panel lateral o modal
- **Wide (≥ 2xl):** 3 columnas (sidebar + editor + panel de backlinks/grafo)

---

## Accesibilidad (WCAG AA mínimo)

### Checklist obligatorio

- [ ] Contraste texto/background: **4.5:1 mínimo** (AA), **7:1 ideal** (AAA) — verificar con [contrast checker](https://webaim.org/resources/contrastchecker/)
- [ ] Todos los interactivos con `cursor: pointer`
- [ ] Focus rings visibles: `ring-2 ring-ring ring-offset-2 ring-offset-background` en todos los focusables
- [ ] Navegación completa con teclado (Tab, Shift+Tab, Enter, Esc, Arrow keys en listas)
- [ ] `aria-label` en botones con solo icono
- [ ] `role="dialog"` + `aria-modal="true"` en modales
- [ ] Skip link al inicio del main content
- [ ] `prefers-reduced-motion: reduce` respetado en todas las animaciones
- [ ] Escalado a 200% funciona sin horizontal scroll
- [ ] Screen reader tested (VoiceOver / NVDA) en flujos críticos

---

## Anti-patterns (NUNCA usar)

### Generales

- ❌ **Emojis como iconos funcionales** — usar Lucide
- ❌ **Transform scale en hover de cards** — rompe layout
- ❌ **Sombras fuertes en dark mode** — no funcionan, usar elevación por background
- ❌ **Gradientes decorativos brillantes** — añaden ruido visual
- ❌ **Colores saturados de muchas familias** — mantener acento monocromático
- ❌ **Texto `#ffffff` puro sobre dark** — fatiga ocular
- ❌ **Background `#000000` puro** — smear OLED, imposible elevar
- ❌ **Animaciones decorativas** — solo animar cuando da feedback
- ❌ **Bounce / spring overshoot** en productivity (reservar para celebraciones)
- ❌ **Loading spinners genéricos** — usar skeletons que mantienen layout
- ❌ **Tooltips que aparecen inmediatamente en hover** — delay mínimo 500ms

### Específicos de SecondMind

- ❌ **Botones flotantes FAB** — no calza con el estilo power-tool
- ❌ **Navegación tipo bottom tabs en desktop** — solo mobile si es necesario
- ❌ **Onboarding multi-step obligatorio** — empty states contextuales en cada pantalla
- ❌ **Modales para acciones rápidas** — usar inline editing siempre que sea posible
- ❌ **Scroll infinito sin señalizar fin** — mostrar count "42 notes" al final
- ❌ **Toast notifications en esquina superior derecha** — usar inline feedback o command palette
- ❌ **Dropdowns con scrollbar visible** — max 8 items visibles, sino usar búsqueda integrada

---

## Pre-delivery checklist

Antes de mergear cualquier componente/página a `main`, verificar:

**Visual**

- [ ] Dark mode por default, light mode probado
- [ ] Colores del token system, no hex hardcoded
- [ ] Tipografía Inter en todos los textos
- [ ] Spacing del sistema de tokens
- [ ] Radius consistente con los tokens
- [ ] Iconos solo de Lucide, 1.5 stroke-width

**Interacción**

- [ ] Hover states en todos los clickables (150ms)
- [ ] Active states (scale 0.98) en botones primarios
- [ ] Focus rings visibles
- [ ] `cursor: pointer` correctamente asignado
- [ ] Transiciones con `cubic-bezier(0.16,1,0.3,1)`

**Accesibilidad**

- [ ] Contrast ratio verificado (AA mínimo)
- [ ] Navegación por teclado completa
- [ ] `prefers-reduced-motion` respetado
- [ ] `aria-label` en icon buttons
- [ ] Screen reader probado en flujo crítico

**Responsive**

- [ ] Funciona en 375px, 768px, 1024px, 1440px
- [ ] Sin horizontal scroll en mobile
- [ ] Sin contenido escondido bajo navbar fixed
- [ ] Tap targets mínimo 44x44px en mobile

**Performance**

- [ ] No layout shift en hover/focus
- [ ] Lazy load de grafo y vistas pesadas
- [ ] Skeleton states para loading (nunca spinners)
- [ ] Animations en GPU (`transform`, `opacity` — no `width/height`)

---

## Referencias de inspiración

- **Linear** — accent indigo, modales, sidebar, empty states
- **Obsidian** — editor de notas, wikilinks, graph view
- **Raycast** — command palette, keyboard-first UX
- **Craft Docs** — tipografía de notas, margin rhythm
- **Notion dark mode** — contraste de jerarquía por profundidad

No copiar visualmente — destilar los principios y aplicarlos a SecondMind.

---

## Implementación en Tailwind v4

Los tokens anteriores se traducen a `src/index.css` usando `@theme inline`:

```css
@import 'tailwindcss';

@theme inline {
  --color-background: oklch(0.09 0.005 270);
  --color-foreground: oklch(0.93 0.005 270);
  --color-card: oklch(0.12 0.008 270);
  --color-primary: oklch(0.62 0.18 275);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-border: oklch(1 0 0 / 0.08);
  --color-muted: oklch(0.18 0.008 270);
  --color-muted-foreground: oklch(0.65 0.01 250);
  --color-destructive: oklch(0.63 0.22 25);
  --color-ring: oklch(0.62 0.18 275 / 0.4);

  --radius: 10px;
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 16px;

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-feature-settings: 'cv11', 'ss01', 'ss03';
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Los colores light mode van en un `:root` selector separado con `@media (prefers-color-scheme: light)` o toggle manual.
