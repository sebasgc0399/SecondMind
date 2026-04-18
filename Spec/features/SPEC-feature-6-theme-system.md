# SPEC — SecondMind · Feature 6: Theme System + Paleta Violet Desaturado

> Alcance: Sistema de temas con 3 modos (Claro / Automático / Oscuro), nueva paleta violet desaturado reemplazando el `#7b2ad1` actual, sección Apariencia en la página de Settings con selector visual tipo macOS/iOS.
> Dependencias: Feature 5 completada (bubble menu y links usan tokens semánticos — se actualizan automáticamente)
> Stack relevante: Tailwind CSS v4 (CSS-first, `@theme inline`), CSS custom properties oklch, `localStorage` para persistencia, `prefers-color-scheme` media query para modo automático

---

## Objetivo

Hoy SecondMind está hardcodeado en dark mode con un violeta saturado (`#7b2ad1`) que "grita". Después de esta feature, el usuario abre Settings → Apariencia y elige entre Claro, Automático (sigue el sistema), u Oscuro. Los colores se sienten premium y sutiles — el violeta desaturado de la Imagen 1 (inspiración Linear/Raycast). El tema persiste entre sesiones vía localStorage. No se toca Firestore — es una preferencia de UI local al dispositivo.

---

## Features

### F1: Paleta violet desaturado + tokens light/dark

**Qué:** Reemplazar los tokens de color en `src/index.css` con la nueva paleta violet desaturado. Definir sets completos de variables CSS para light mode y dark mode. El light mode es nuevo — hoy no existe una paleta light funcional.

**Criterio de done:**

- [ ] Variables CSS `--primary`, `--primary-foreground`, `--accent`, `--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--border`, `--ring`, `--sidebar-*` etc. definidas para AMBOS modos (light y dark) en `src/index.css`
- [ ] La paleta violet usa tonos desaturados en oklch (no el `#7b2ad1` vivido actual)
- [ ] En dark mode, la app se ve igual o mejor que hoy (no hay regresión visual)
- [ ] En light mode, la app es legible con contraste suficiente (WCAG AA en texto sobre fondo)
- [ ] Los colores hardcodeados existentes (`bg-blue-500/15`, `bg-yellow-500/15`, `bg-green-500/15` de DistillBadge, priority badges) NO se tocan — son semánticos por contexto, no por tema
- [ ] `npm run build` verde

**Archivos a crear/modificar:**

- `src/index.css` — Reescribir las secciones `:root` (light) y `.dark` (dark) con la nueva paleta

**Notas de implementación:**

- **Paleta violet desaturado (referencia de la imagen del usuario):**
  Escala en oklch con chroma reducido (~0.08–0.12 en vez de 0.18+ del #7b2ad1). Los valores exactos deben ajustarse visualmente, pero la dirección es:
  - 50: `oklch(0.97 0.02 285)` — casi blanco con tinte violet
  - 100: `oklch(0.94 0.04 285)`
  - 200: `oklch(0.88 0.06 285)`
  - 300: `oklch(0.78 0.08 285)`
  - 400: `oklch(0.65 0.11 285)`
  - 500: `oklch(0.55 0.14 285)` — midpoint, el "hero" color
  - 600: `oklch(0.48 0.14 285)`
  - 700: `oklch(0.40 0.12 285)`
  - 800: `oklch(0.32 0.10 285)`
  - 900: `oklch(0.24 0.08 285)`
  - 950: `oklch(0.16 0.06 285)` — casi negro con tinte violet
    (El hue 285 es violeta en oklch. Ajustar ±5 si se ve demasiado azul o rosado.)

- **Tokens semánticos light mode** (los que importan para shadcn/ui):
  - `--background`: violet-50 o blanco puro
  - `--foreground`: violet-950
  - `--card` / `--popover`: white o violet-50
  - `--primary`: violet-600 (el accent principal)
  - `--primary-foreground`: white
  - `--muted`: violet-100
  - `--muted-foreground`: violet-500
  - `--accent`: violet-100
  - `--accent-foreground`: violet-900
  - `--border`: violet-200
  - `--ring`: violet-400
  - `--sidebar-background`: violet-50 o white
  - `--sidebar-primary`: violet-600
  - `--sidebar-accent`: violet-100

- **Tokens dark mode:** Mantener la estructura actual pero con la paleta desaturada. `--background` en violet-950, `--foreground` en violet-50, `--primary` en violet-400 o 300 (más claro para contraste en fondo oscuro).

- **Chrome Extension y Tauri no se tocan.** La extension tiene su propio `popup.css` con `prefers-color-scheme`. Tauri/Capacitor renderizan el mismo web bundle, así que heredan los cambios automáticamente.

---

### F2: Hook useTheme + lógica de aplicación de tema

**Qué:** Hook `useTheme` que maneja la preferencia de tema (`light` | `dark` | `auto`), persiste en `localStorage`, aplica la clase `dark` en `<html>`, y escucha `prefers-color-scheme` cuando el modo es `auto`. El tema se aplica antes del primer render para evitar flash.

**Criterio de done:**

- [ ] `useTheme()` retorna `{ theme, setTheme, resolvedTheme }` donde `theme` es la preferencia (`light` | `dark` | `auto`) y `resolvedTheme` es el modo efectivo (`light` | `dark`)
- [ ] Cambiar `theme` a `dark` → clase `dark` en `<html>` + localStorage actualizado
- [ ] Cambiar `theme` a `light` → sin clase `dark` en `<html>` + localStorage actualizado
- [ ] Cambiar `theme` a `auto` → clase `dark` se aplica/quita según `prefers-color-scheme`
- [ ] Si el sistema cambia de light a dark (y viceversa) con modo `auto` activo, la app se actualiza en tiempo real sin reload
- [ ] Al cargar la app, el tema se resuelve desde localStorage ANTES del primer render (sin flash de tema incorrecto)
- [ ] Default si no hay preferencia guardada: `dark` (preserva comportamiento actual)
- [ ] `npm run build` verde

**Archivos a crear/modificar:**

- `src/hooks/useTheme.ts` — Hook con lógica de persistencia y media query listener
- `src/lib/theme.ts` — Script inline o helper para aplicar tema antes de React mount (anti-flash)
- `src/index.html` — Script inline `<script>` en `<head>` que lee localStorage y aplica clase `dark` sincrónicamente
- `src/app/layout.tsx` — Montar `useTheme` a nivel global (o via provider si es necesario para context)

**Notas de implementación:**

- **Anti-flash (crítico).** Si el tema se aplica después del mount de React, el usuario ve un flash del tema contrario durante ~200ms. La solución estándar es un `<script>` inline síncrono en `<head>` de `index.html`:

  ```html
  <script>
    (function () {
      var theme = localStorage.getItem('sm-theme') || 'dark';
      var isDark =
        theme === 'dark' ||
        (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    })();
  </script>
  ```

  Este script se ejecuta antes de que el browser renderice nada. El hook `useTheme` luego toma el control para cambios dinámicos.

- **localStorage key:** `sm-theme` (prefijo para no chocar con otras apps en localhost).

- **`matchMedia` listener para auto mode:**

  ```typescript
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', (e) => {
    if (currentTheme === 'auto') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
  ```

  Cleanup en el hook con `removeEventListener`.

- **Tailwind v4 dark mode:** shadcn/ui con Tailwind v4 ya configura `@custom-variant dark (&:where(.dark, .dark *))` — basado en clase `.dark` en el `<html>`. No hay cambios en la config de Tailwind. Verificar que esto ya esté presente en `src/index.css`; si usa `@media (prefers-color-scheme: dark)` en vez de la variante basada en clase, hay que migrar a `@custom-variant`.

- **No usar Context/Provider si no es necesario.** Si solo Settings consume `setTheme` y el tema se aplica vía clase en `<html>`, no hace falta un provider global. El hook puede leer de localStorage + DOM directamente. Un `useSyncExternalStore` con un store simple es la opción más limpia.

---

### F3: Sección Apariencia en Settings

**Qué:** Agregar una sección "Apariencia" en `/settings` con un selector visual de 3 opciones: Básica (light), Automática (sigue sistema), Oscuro. Las opciones se muestran como cards con preview visual del modo (como la Imagen 2 del usuario — estilo macOS). La opción activa tiene borde de selección.

**Criterio de done:**

- [ ] La sección "Apariencia" aparece en `/settings` con título "Modo de color" (o "Apariencia")
- [ ] Se muestran 3 cards clickeables: Básica, Automática, Oscuro
- [ ] Cada card tiene un mini-preview visual que sugiere el modo (fondo claro/oscuro/mixto)
- [ ] La card activa tiene borde `border-primary` o `ring` visible
- [ ] Click en una card cambia el tema inmediatamente (sin guardar explícito)
- [ ] El tema persiste al recargar la página
- [ ] En modo Automático, si el sistema está en dark → la card Automática indica visualmente que está en "oscuro" (o algún indicador sutil)
- [ ] Mobile: las 3 cards en una fila (caben en 375px) o stack vertical si no caben
- [ ] `npm run build` verde

**Archivos a crear/modificar:**

- `src/app/settings/page.tsx` — Agregar sección Apariencia con las 3 cards
- `src/components/settings/ThemeSelector.tsx` — Componente del selector con las 3 cards visuales

**Notas de implementación:**

- **Cards con preview:** Cada card es un `<button>` con un mini-mockup SVG o CSS-only que simula una ventana con fondo claro/oscuro. No necesita ser perfecto — 2-3 divs con colores del tema bastan para comunicar la idea. Referencia: la Imagen 2 del usuario muestra un estilo macOS con una "ventana" minimalista.
- **Selección inmediata:** No hay botón "Guardar". Click en card → `setTheme(mode)` → efecto instantáneo. Patrón consistente con todos los toggles del proyecto (optimistic, sin confirmación).
- **Layout responsive:** `grid grid-cols-3 gap-3` en desktop/tablet. En 375px, `grid-cols-3` con cards más compactas (cada una ~105px wide). Si queda apretado, `grid-cols-1` con filas horizontales.
- **La sección Apariencia va ARRIBA de las otras secciones** en Settings — es la más visual y la primera que el usuario buscará.

---

## Orden de implementación

1. **F1: Paleta + tokens** → Fundamento. Primero actualizar los colores para que todo lo demás (light mode, selector) use la nueva paleta. Dark mode actualizado como primer paso, verificable de inmediato.
2. **F2: Hook + anti-flash** → Infraestructura del tema. Habilita light mode por primera vez. Verificable cambiando localStorage manualmente.
3. **F3: Settings UI** → La UI para que el usuario acceda. Depende de F1 y F2 para que el selector tenga efecto visual real.

---

## Estructura de archivos

```
src/
├── hooks/
│   └── useTheme.ts             # NUEVO — hook de tema con localStorage + matchMedia
├── lib/
│   └── theme.ts                # NUEVO — constantes y helpers de tema
├── components/
│   └── settings/
│       └── ThemeSelector.tsx    # NUEVO — selector visual de 3 cards
├── app/
│   └── settings/
│       └── page.tsx            # MODIFICADO — agregar sección Apariencia
├── index.html                  # MODIFICADO — script anti-flash en <head>
└── index.css                   # MODIFICADO — paleta light + dark actualizada
```

---

## Definiciones técnicas

### D1: ¿Persistir tema en localStorage o Firestore?

- **Opciones:** (A) localStorage, (B) Firestore en `users/{userId}/preferences`
- **Decisión:** A — localStorage
- **Razón:** El tema es una preferencia de dispositivo, no de cuenta. Un usuario puede querer dark en su laptop y light en su teléfono. localStorage es instantáneo (0ms), no requiere auth, y el script anti-flash funciona sin await. Firestore agregaría latencia + dependencia de auth + round-trip innecesario. Si en el futuro se quiere sync de preferencias cross-device, se puede agregar un layer de Firestore encima sin romper nada.

### D2: ¿Script anti-flash inline vs module?

- **Opciones:** (A) `<script>` inline en `index.html`, (B) module importado en `main.tsx`
- **Decisión:** A — Script inline
- **Razón:** Los modules se ejecutan con `defer` por defecto — el browser puede renderizar antes de que el script corra, causando flash. Un `<script>` inline clásico (no type="module") se ejecuta sincrónicamente durante el parsing del HTML, antes de que el body se renderice. Es la única forma confiable de evitar flash en todos los browsers.

### D3: ¿Default theme para usuarios nuevos?

- **Opciones:** (A) `dark` (preserva comportamiento actual), (B) `auto` (sigue sistema)
- **Decisión:** A — `dark`
- **Razón:** La app siempre fue dark. Cambiar el default a auto haría que usuarios existentes vean un cambio inesperado al actualizar. Los nuevos users pueden cambiar en Settings. Si más adelante se quiere `auto` como default, se cambia una línea en el script de `index.html`.

---

## Checklist de completado

Al terminar esta feature, TODAS estas condiciones deben ser verdaderas:

- [ ] La app funciona visualmente en light mode Y dark mode sin elementos rotos
- [ ] Los colores usan la nueva paleta violet desaturado (no `#7b2ad1`)
- [ ] Settings → Apariencia muestra 3 cards funcionales (Básica / Automática / Oscuro)
- [ ] Click en una card cambia el tema inmediatamente
- [ ] El tema persiste al recargar la página
- [ ] Modo Automático sigue `prefers-color-scheme` del sistema en tiempo real
- [ ] No hay flash de tema incorrecto al cargar la app (script anti-flash funciona)
- [ ] Highlight del editor (mark amarillo) es legible en ambos temas
- [ ] Bubble menu, popover del DistillIndicator, y backlinks panel se ven bien en ambos temas
- [ ] Login page respeta el tema seleccionado
- [ ] `npm run build` exit 0
- [ ] `npm run lint` exit 0 (o sin regresiones nuevas)
- [ ] Merge a main + deploy

---

## Verificación E2E sugerida

| #   | Test                                            | Qué verificar                                                    |
| --- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Dark mode default (sin localStorage)            | App se ve en dark con la paleta desaturada                       |
| 2   | Settings → click "Básica"                       | App cambia a light mode inmediatamente                           |
| 3   | Settings → click "Oscuro"                       | App vuelve a dark mode                                           |
| 4   | Settings → click "Automática" + sistema en dark | App en dark                                                      |
| 5   | Reload con light mode guardado                  | No hay flash de dark, carga directo en light                     |
| 6   | Reload con dark mode guardado                   | No hay flash de light                                            |
| 7   | Light mode: editor con highlight                | Mark amarillo legible sobre fondo claro                          |
| 8   | Light mode: sidebar                             | Colores correctos, item activo visible                           |
| 9   | Light mode: bubble menu                         | Fondo, bordes, active state visibles                             |
| 10  | Light mode: NoteCard con badges                 | DistillBadge, priority, noteType legibles                        |
| 11  | Light mode: login page                          | Fondo correcto, botón Google visible                             |
| 12  | Mobile 375px: ThemeSelector                     | 3 cards caben, selección funciona                                |
| 13  | Dark mode: todos los elementos                  | Regresión visual — nada roto vs estado actual                    |
| 14  | Dashboard con todos los cards                   | Greeting, Inbox, RecentNotes, DailyDigest, Habits en ambos temas |
| 15  | Command palette (Ctrl+K)                        | Fondo, resultados, hover state en ambos temas                    |
| 16  | Quick Capture (Alt+N)                           | Modal con colores correctos en ambos temas                       |
| 17  | Build + lint verdes                             | `npm run build` exit 0                                           |

---

## Gotchas anticipados

- **`@custom-variant dark` en Tailwind v4.** Si el proyecto usa `@media (prefers-color-scheme: dark)` en vez de `@custom-variant dark (&:where(.dark, .dark *))`, la clase `.dark` en `<html>` no tendrá efecto y todo seguirá en media-query mode. Verificar `src/index.css` en el primer paso de F2 y migrar si es necesario. Este es el blocker más probable.
- **Colores hardcodeados fuera de tokens.** Buscar en el codebase `oklch(` directos en componentes o en `index.css` que no pasen por variables CSS. Los que más riesgo tienen: `.note-editor .ProseMirror mark` (highlight L2), `.editor-link` styles, graph node colors en `KnowledgeGraph.tsx`. Mapear al inicio de F1.
- **graph colors (Reagraph).** Los nodos del grafo usan colores por `paraType` hardcodeados. Deben funcionar en ambos temas o usar variables CSS. Si Reagraph acepta CSS vars como color, ideal; si no, pasar colores resueltos dinámicamente.
- **Splash screen de Capacitor (Android).** Usa `#878bf9` hardcodeado en `colors.xml`. No se toca en esta feature — es un splash de carga, no parte del tema runtime.
- **Chrome Extension popup.** Tiene su propio `popup.css` con `prefers-color-scheme`. No se sincroniza con el tema de la app principal. Esto es correcto — la extensión sigue el sistema, la app sigue la preferencia del usuario.
- **Tailwind classes que usan `dark:` prefix.** Revisar que todos los `dark:` en el codebase sigan funcionando. Con el variant basado en clase, `dark:bg-red-500` solo aplica si `.dark` está en `<html>`. Si el variant actual es media-query, esos `dark:` ya funcionan — pero al migrar a class-based podrían necesitar la clase explícita.

---

## Siguiente iteración candidata

- **Temas de acento** (beyond violet): permitir elegir color de acento (azul, verde, naranja) cambiando solo `--primary-*` tokens. Los fondos/borders/muted no cambian.
- **Sidebar compacta** toggle (mencionado en doc UX como parte de Apariencia).
- **Sync de preferencias cross-device** via Firestore si hay demanda.
