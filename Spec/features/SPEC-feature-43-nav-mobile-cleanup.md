# SPEC — SecondMind · F43: Limpieza de navegación mobile (BottomNav 4 + drawer único)

> **Estado:** Pre-implementación (Mayo 2026). Branch destino: `feat/nav-mobile-cleanup-f43`.
> Alcance: cleanup UI mobile sin nueva lógica. NO toca repos, stores, persisters, rutas ni el modelo de datos.
> Dependencias: F32 (`<Sidebar />` desktop), F32.4 (responsive transition). Ninguna dependencia nueva.
> Estimado: 2-3 días solo dev.
> Stack relevante: React + `@base-ui/react/dialog` (drawer existente), Tailwind v4, React Router `NavLink`.

---

## Objetivo

Eliminar dos antipatrones de navegación mobile detectados en discovery con Playwright (390×844) y validados con literatura de UX (NN/g, Material 3, Mobbin, Smashing):

1. **BottomNav y NavigationDrawer compiten como overflow.** El slot "Más" del `<BottomNav />` abre un `<MoreDrawer />` con Proyectos, Objetivos, Hábitos, Grafo, Settings — exactamente el mismo rol que el `<NavigationDrawer />` (sidebar drawer). Material 3 y NN/g coinciden: un solo overflow.
2. **FAB y CTA "Capturar" del sidebar duplican entrada al modal QuickCapture.** Material 3 explícito: el FAB representa LA primary action de la screen; repetirla en otro componente le quita peso (Mobbin, ServiceNow Horizon).

F43 racionaliza el modelo mobile a:

- **BottomNav 4 slots fijos:** Dashboard / Notas / Tareas / Inbox(badge). Sin "Más", sin slot 5.
- **`<MoreDrawer />` eliminado** (componente + tests + mount).
- **`<NavigationDrawer />` (sidebar drawer) = único cajón** de destinos secundarios + cuenta, accesible desde la hamburguesa del header.
- **FAB Captura rápida = única entrada primaria** al modal QuickCapture desde mobile. CTA "Capturar" eliminado del drawer.

Sin tocar repos, stores, persisters, rutas. Es cleanup UI puro, mobile-only.

---

## Features

### F43.1 — Eliminación del CTA "Capturar" del NavigationDrawer

**Qué:** Eliminar el botón violeta full-width "Capturar" del `<NavigationDrawer />` (sidebar drawer mobile). El FAB en `<FAB />` queda como única entrada primaria al modal QuickCapture. Resto del drawer (avatar/nombre, Buscar, destinos de navegación, Settings, Sign out) preservado funcionalmente, con re-agrupado de secciones a definir en Plan mode (ver D5) — la sección "CAPTURA" queda con Inbox como único hijo y debe re-organizarse para no dejar una sección con un solo link.

**Criterio de done:**

- [ ] `<NavigationDrawer />` NO renderiza un botón con label "Capturar" entre el campo de búsqueda y la sección "EJECUCIÓN".
- [ ] El campo "Buscar" permanece sin cambios.
- [ ] Avatar+nombre, botón "Cerrar menú", campo "Buscar", Settings, Sign out — sin cambios.
- [ ] Todos los destinos secundarios (Dashboard, Tareas, Proyectos, Objetivos, Hábitos, Inbox, Notas, Grafo) presentes y navegables. El agrupado final del drawer (3 secciones vs fusión vs Inbox suelto) lo decide Plan mode evaluando el render real — **regla dura: ninguna sección queda con un único hijo** (ver D5).
- [ ] Si el botón estaba implementado como instancia de un componente reusable (ej. `<QuickCaptureButton />`), el componente sigue existiendo siempre que sea consumido por `<FAB />` u otros; solo se elimina la instancia del drawer.
- [ ] Si era JSX inline, se elimina el bloque + cualquier handler/state local que solo lo apoyaba.
- [ ] Orden de focus por teclado predecible: Cerrar menú → Buscar → primer link de Ejecución → … → Sign out (sin botón Capturar intermedio).
- [ ] Tests existentes de `<NavigationDrawer />` que asertaban presencia de "Capturar" — actualizados o eliminados según corresponda.
- [ ] E2E Playwright mobile (390×844): abrir hamburguesa → confirmar que entre Buscar y "EJECUCIÓN" no hay botón "Capturar" intermedio → cerrar drawer → tap FAB → modal QuickCapture abre normal.
- [ ] `npm run lint`, `npm run build`, `npm test` pasan.

**Archivos a crear/modificar:**

- `src/components/layout/NavigationDrawer.tsx` — eliminar el bloque del CTA "Capturar" (botón violeta full-width).

**Notas de implementación:**

- Verificar en Plan mode si el botón "Capturar" del drawer es:
  - (a) instancia de un componente reusable (`<QuickCaptureButton />` o similar de `src/components/capture/`) → eliminar solo la instancia y el import.
  - (b) JSX inline en `NavigationDrawer.tsx` con handler local → eliminar el bloque + el handler + cualquier state que solo lo soporte.
- `<Sidebar />` (desktop, F32) NO se modifica — fuera de scope. En Plan mode confirmar que `<Sidebar />` desktop no tiene un CTA "Capturar" análogo cuya eliminación quede inconsistente. Si lo tiene y la decisión del usuario aplica también ahí, escalar a una sub-feature dedicada (F43.3) o documentar el desvío.
- **Re-agrupado de secciones post-cleanup (diferido a Plan mode, ver D5):** al eliminar el CTA "Capturar", la sección "CAPTURA" del drawer queda con un único hijo (Inbox). Una sección con un solo link es ruido visual. Dos opciones a evaluar viendo el código real y el render:
  - **(a) Promover Inbox a item suelto** sin section header, posicionado arriba de "EJECUCIÓN" (estilo Slack/Notion: items destacados al tope sin etiqueta de sección).
  - **(b) Fusionar Inbox dentro de "EJECUCIÓN"** (Inbox conceptualmente sigue siendo parte de la ejecución diaria; la sección "CAPTURA" desaparece y Inbox queda como un link más bajo el header "EJECUCIÓN").
  - Plan mode elige la que quede mejor visualmente. Ambas son aceptables. No es bloqueante para arrancar la implementación, pero F43.1 no se considera done si el drawer queda con una sección de un solo hijo.
- Si hay un test E2E o snapshot que captura el drawer abierto, regenerar.

---

### F43.2 — BottomNav reducido a 4 slots + eliminación de MoreDrawer

**Qué:** Reducir `<BottomNav />` a 4 destinos primarios fijos (Dashboard / Notas / Tareas / Inbox con badge). Eliminar el slot "Más" del componente y borrar `<MoreDrawer />` con todos sus archivos asociados (tests, mount en layout, imports residuales). El estado/handler que abría el drawer también se elimina sin dejar wiring huérfano.

**Criterio de done:**

- [ ] `<BottomNav />` renderiza exactamente 4 elementos navegables (4 `<NavLink>`), no 5.
- [ ] Cada slot tiene `aria-current="page"` cuando matchea la ruta activa (preservar el patrón existente).
- [ ] El slot Inbox conserva su badge numérico y el `aria-label` con count (ej. `"Inbox, 3 items"` — replicar el patrón actual, no inventar).
- [ ] Tap targets de cada slot miden ≥ 44×44 px (Apple HIG, Material). Verificar con Playwright `el.getBoundingClientRect()` en los 4 viewports E2E.
- [ ] `src/components/layout/MoreDrawer.tsx` ELIMINADO.
- [ ] `src/components/layout/MoreDrawer.test.tsx` ELIMINADO si existe.
- [ ] Cualquier import de `MoreDrawer` en `src/app/layout.tsx` o donde se monte — eliminado, junto con el render `<MoreDrawer ... />` correspondiente.
- [ ] Cualquier state/context/hook/prop que orquestara la apertura del sheet "Más" — eliminado limpio. Si `<MoreDrawer />` consumía `useMountedTransition` (gotcha F35.1) o flags state-based + `setTimeout`, no dejar useEffect huérfanos ni hooks que ya nadie usa.
- [ ] BottomNav permanece hidden en breakpoint desktop (gating tipo `md:hidden` o equivalente — no tocar el gating, solo el contenido).
- [ ] `<Sidebar />` desktop sigue mostrando los destinos secundarios sin cambios (Proyectos/Objetivos/Hábitos/Grafo/Settings ya estaban ahí en F32 — el cleanup es mobile-only).
- [ ] `<FAB />` sigue rendering con el mismo offset visual (no dependía geométricamente del slot 5 del BottomNav). Si hay regresión visual, ajustar offset y documentar.
- [ ] E2E Playwright en 4 viewports (375×667 iPhone SE, 390×844 iPhone 13/14, 412×892 S23 Ultra, 768×1024 tablet): mobile muestra 4 slots y NO botón "Más"; tablet/desktop sin cambios respecto a F32.
- [ ] Tests de `<BottomNav />` existentes — actualizados (5→4 items, eliminar asserts del botón "Más").
- [ ] `npm run lint`, `npm run build`, `npm test` pasan.

**Archivos a crear/modificar:**

- `src/components/layout/BottomNav.tsx` — modificado. Eliminar slot "Más", su handler, su state local, su `aria-label`/icono.
- `src/components/layout/MoreDrawer.tsx` — **BORRADO**.
- `src/components/layout/MoreDrawer.test.tsx` — **BORRADO** si existe (verificar con Glob en Plan mode).
- `src/app/layout.tsx` — quitar import + el render `<MoreDrawer />` si está montado top-level (a confirmar en Plan mode con grep `MoreDrawer`).

**Notas de implementación:**

- En Plan mode con Explore agents, confirmar dónde se monta `<MoreDrawer />`: top-level en `app/layout.tsx`, dentro de `<BottomNav />` mismo, o ambos. Eso determina qué archivos se tocan.
- Si `<MoreDrawer />` orquesta su apertura via state global (ej. context, Zustand, prop drilling desde `<BottomNav />`), eliminar el state + el provider/consumer chain. El cleanup debe ser quirúrgico — si encontrás un hook `useMoreDrawer()` o similar, eliminarlo.
- A11y del slot Inbox: el badge "3" debe quedar accesible — chequear si el patrón actual usa `aria-label="Inbox, 3 items"` o `<span aria-hidden>3</span>` + label sin count. Replicar lo que ya existe.
- Si `<MoreDrawer />` exportaba un type/interface consumido en otro lado (`MoreDrawerProps`, `MoreDrawerItem`), eliminar también esos exports.
- Sanity check post-cleanup: `grep -r "MoreDrawer" src/` debe retornar 0 matches.

---

## Orden de implementación

1. **F43.1** — Sidebar sin CTA "Capturar". Cambio aislado a 1 archivo, sin dependencias estructurales. Hacerlo primero permite validar visualmente el drawer "puro" antes de tocar la BottomNav, y deja un commit atómico chico que se puede mergear o revertir trivialmente si surge feedback.
2. **F43.2** — BottomNav 4 slots + eliminación MoreDrawer. Más invasivo (3-4 archivos + posible mount en `app/layout.tsx` + cleanup de state/hooks asociados). Después de F43.1 para que el QA del drawer ya esté validado cuando llegue el turno del cleanup más grande.

---

## Estructura de archivos

```
src/
├── components/
│   └── layout/
│       ├── BottomNav.tsx              # F43.2 (modificado: 5→4 slots, sin handler "Más")
│       ├── MoreDrawer.tsx             # F43.2 (BORRADO)
│       ├── MoreDrawer.test.tsx        # F43.2 (BORRADO si existe)
│       └── NavigationDrawer.tsx       # F43.1 (eliminar CTA "Capturar")
└── app/
    └── layout.tsx                     # F43.2 (quitar mount de MoreDrawer si aplica)
```

---

## Definiciones técnicas

### D1 — Scope cross-platform: solo mobile, sin tocar tablet/desktop

- **Decisión:** El cleanup aplica únicamente al viewport mobile (breakpoint < `md`). `<Sidebar />` desktop (F32, collapsed/expanded), `<TopBar />` desktop, y cualquier nav tablet/desktop permanecen sin cambios.
- **Razón:** El antipatrón solo existe en mobile (BottomNav, MoreDrawer y FAB se renderizan únicamente en mobile; en desktop la nav es `<Sidebar />` lateral fija). Tocar el código desktop expandiría el scope sin valor.
- **Verificación en Plan mode:** confirmar con Explore agent que `<MoreDrawer />` solo se monta en breakpoint mobile (probablemente vía `md:hidden` o gate explícito en `app/layout.tsx`). Si se monta cross-platform, evaluar antes de borrar.

### D2 — Componentes a preservar vs eliminar vs modificar

| Componente                                         | Acción      | Razón                                                                       |
| -------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| `<BottomNav />`                                    | Modificar   | 5 → 4 slots, eliminar handler "Más"                                         |
| `<MoreDrawer />`                                   | Borrar      | Redundante con `<NavigationDrawer />`                                       |
| `<NavigationDrawer />`                             | Modificar   | Eliminar instancia de CTA "Capturar"                                        |
| `<FAB />`                                          | Sin cambios | Ya es el primary action holder                                              |
| `<MobileHeader />`                                 | Sin cambios | Hamburguesa permanece como única entrada al drawer                          |
| `<Sidebar />`                                      | Sin cambios | Desktop, fuera de scope F43                                                 |
| `<QuickCaptureButton />` (si existe como reusable) | Sin cambios | Sigue vivo si lo consume `<FAB />`; solo se elimina su instancia del drawer |

### D3 — Justificación del modelo final (validado con literatura)

- BottomNav (4 destinos primarios) + drawer (overflow secundarios + cuenta) + FAB (primary action) es el **combo validado por NN/g** (uso 86% combo vs 57% solo hamburger).
- 4 destinos en BottomNav (en lugar de 5 con slot "Más") es válido cuando el drawer cubre el overflow — el slot "Más" iOS-style es redundante si ya hay drawer.
- FAB sin CTA duplicado en drawer respeta la regla Material 3: "the most important action on a screen, such as Create or Reply" — la primary action no se repite.

### D4 — Accesibilidad mantenida

- BottomNav 4 slots: `<NavLink>` (no `<button>`) con `aria-current="page"` en el activo.
- Tap targets ≥ 44×44 px (Apple HIG, WCAG 2.5.5 AAA target). Verificar con Playwright `getBoundingClientRect()` en los 4 viewports E2E.
- Slot Inbox: mantener el patrón actual de `aria-label` con count (no inventar — replicar lo que existe pre-F43).
- Drawer post-cleanup: orden de focus determinístico (Cerrar menú → Buscar → primer link de Ejecución → … → Sign out).

### D5 — Re-agrupado de secciones del drawer post-cleanup (diferida a Plan mode)

- **Problema:** al eliminar el CTA "Capturar" en F43.1, la sección "CAPTURA" del `<NavigationDrawer />` queda con un único hijo (Inbox). Una sección con un solo link es ruido visual — viola el principio de "no agrupar para agrupar".
- **Opciones consideradas:**
  - **(a) Inbox suelto arriba de "EJECUCIÓN"** sin section header. Estilo Slack/Notion: items destacados al tope sin etiqueta. Mantiene "EJECUCIÓN" y "CONOCIMIENTO" como secciones agrupadas.
  - **(b) Fusionar Inbox dentro de "EJECUCIÓN"**. La sección "CAPTURA" desaparece; Inbox queda como un link más bajo el header "EJECUCIÓN" (es defendible: revisar el inbox es parte de la ejecución diaria del Zettelkasten).
- **Decisión:** diferida a Plan mode. La elección depende del render visual real (jerarquía tipográfica de los headers, densidad, alineación de iconos). Ambas opciones son aceptables.
- **Regla dura:** ninguna sección del drawer queda con un único hijo después del cleanup. Esto es criterio de done de F43.1.

---

## Checklist de completado

- [ ] F43.1 y F43.2 con todos los criterios de done verificados.
- [ ] `npm run build` sin errores TS.
- [ ] `npm test` pasa, tests obsoletos de `<MoreDrawer />` eliminados, tests de `<NavigationDrawer />` y `<BottomNav />` actualizados.
- [ ] `npm run lint` clean (sin imports huérfanos de `MoreDrawer`).
- [ ] `grep -r "MoreDrawer" src/` retorna 0 matches.
- [ ] E2E Playwright cubre los 4 viewports (375×667, 390×844, 412×892, 768×1024) — confirmar 4 slots BottomNav, sin botón "Más", sin CTA "Capturar" en drawer mobile.
- [ ] Manual QA web (Chrome DevTools mobile emulation): 4 slots, drawer limpio, FAB funcional, sidebar desktop intacto.
- [ ] Manual QA Capacitor (Android Samsung S23 Ultra, build APK debug): instalar APK → confirmar 4 slots → confirmar drawer sin "Capturar" → confirmar FAB abre QuickCapture.
- [ ] Manual QA Tauri (desktop Windows): regresión — sidebar/desktop nav sin cambios visibles.
- [ ] Commits atómicos por sub-feature, conventional commits en español, branch `feat/nav-mobile-cleanup-f43`. Co-Authored-By Claude Opus 4.7 al final.
- [ ] Deploy hosting (`npm run build && npm run deploy`). **Tauri MSI/NSIS y APK Capacitor diferidos al release coordinado v0.2.9** — acumular con próximas features mobile (decisión usuario, sesión 2026-05-03).
- [ ] Merge `--no-ff` a main con commit descriptivo.
- [ ] Step 8 SDD: archivar SPEC convertido a registro de implementación + escalar gotchas si surgen. Candidatos posibles:
  - Limpieza correcta de `useMountedTransition` o animation flags al borrar componente que los consumía (extender gotcha vivo F35.1 si aplica).
  - Patrón de "componente reusable usado por dos lugares — eliminar solo una instancia, no el componente" → `gotchas/ui-componentes.md` si aplica al `<QuickCaptureButton />`.

---

## Siguiente fase

F44 candidato: continuar polish UX mobile sobre las pantallas individuales (Dashboard, Inbox, Notas, Tareas, editor TipTap) en viewport ≤ 412 px — feedback puntual del usuario tras esta racionalización de nav. Decidir cuando F43 esté en producción y haya nuevo discovery con Playwright.
