# Responsive & Mobile UX

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Breakpoint detection via `useSyncExternalStore` + `matchMedia`

`useMediaQuery(query)` + `useBreakpoint()` en [`src/hooks/useMediaQuery.ts`](../../src/hooks/useMediaQuery.ts). Mismo patrón que `useOnlineStatus`.

## Render condicional JSX para shell, CSS para layouts internos

Sidebar oculta en mobile via `!isMobile && <Sidebar>`; BottomNav/FAB ocultos en desktop. Dentro de cada página, responsive con clases Tailwind.

## `SidebarContent` exportado y reusado por `NavigationDrawer`

Evita duplicar array de nav items y handlers. Callback `onNavigate` cierra el dialog al click.

## `viewport-fit=cover` en `index.html`

Más `--sai-top/bottom/left/right: env(safe-area-inset-*)` en `index.css`. Body aplica `padding-left/right` global; top/bottom granular en MobileHeader y BottomNav/FAB para no duplicar.

## Tap targets ≥44×44 via wrapper label

Para base-ui Checkbox: `<label class="h-11 w-11 flex items-center justify-center">` con el `<input h-4 w-4>` adentro. Mismo patrón para botones: contenedor h-11 w-11 + icono 16-20px.

## `<table>` + sticky `th/td:first-child` para HabitGrid

`position: sticky; left: 0; background: var(--background); z-index: 10` + wrapper `<div class="overflow-x-auto">`. NO migrar a CSS grid.

## BottomNav fixed + `calc(80px + var(--sai-bottom))` height

Main tiene `padding-bottom: calc(80px + var(--sai-bottom))` para que el content no quede tapado. FAB bottom: `calc(80px + 16px + var(--sai-bottom))`.

## Cache del SW persiste entre reinstalaciones del APK en Capacitor

WebView retiene bundle viejo al `adb install -r`. `registerType: 'autoUpdate'` resuelve en reloads subsiguientes; para E2E confiable, desinstalación completa + install fresh.

## Grid mobile-first con `grid-cols-1` explícito

`grid` en Tailwind sin `grid-cols-1` explícito deja children crecer. Un `<div class="grid gap-4 lg:grid-cols-2">` con hijos de content largo estira la implicit column auto hasta miles de px en mobile. Siempre empezar con `grid-cols-1`: `grid grid-cols-1 gap-4 lg:grid-cols-2`.

## `@media (hover: hover)` se evalúa por input device, NO por viewport

En navegadores headless con mouse simulator (Playwright, Puppeteer) y en mobile real con teclado/mouse externo, el query reporta `true` sin importar el ancho de pantalla — los iconos hover-revealed quedan invisibles aunque el viewport sea de 375px. Para hover-reveal "solo en pantallas grandes", usar breakpoint Tailwind (`md:opacity-0 md:group-hover:opacity-100`). Patrón vivo en [src/components/editor/NoteCard.tsx](../../src/components/editor/NoteCard.tsx).
