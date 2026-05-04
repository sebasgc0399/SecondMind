# SPEC — Limpieza de navegación mobile (Registro de implementación)

> Estado: Completada Mayo 2026
> Commits: `27b024d` SPEC inicial, `4c383e8` F43.1 CTA Capturar + Inbox a Ejecución, `507fcf2` F43.2 BottomNav 4 slots + MoreDrawer eliminado, `8dac29c` Merge a main
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Eliminar dos antipatrones de navegación mobile detectados en discovery con Playwright (390×844) y validados con literatura UX (NN/g, Material 3, Mobbin, Smashing):

1. `<BottomNav />` slot "Más" abría `<MoreDrawer />` con destinos secundarios (Proyectos, Objetivos, Hábitos, Grafo, Settings) — exactamente el rol que cubre `<NavigationDrawer />`. Doble overflow.
2. FAB y CTA "Capturar" del sidebar duplicaban entrada al modal QuickCapture. Material 3 explícito: el FAB es LA primary action de la screen; repetirla le quita peso.

F43 racionalizó el modelo a: BottomNav 4 slots fijos (Dashboard / Notas / Tareas / Inbox) + drawer único (NavigationDrawer mobile, Sidebar desktop) como overflow de secundarios + FAB único como primary action de captura. Sin tocar repos/stores/persisters.

## Qué se implementó

- **F43.1 — CTA Capturar eliminado + Inbox fusionado en Ejecución:** se eliminó el botón violeta full-width "Capturar" de `<SidebarContent />` (afectó cross-platform desktop sidebar + tablet sidebar collapsed + mobile/tablet drawer por construcción) junto con su handler `handleCaptureClick`, hook `useQuickCapture` y import `Plus`. En `navItems.ts` Inbox se movió a sección "Ejecución" posición 2 (post-Dashboard) y la sección "Captura" desapareció. Archivos tocados: `src/components/layout/Sidebar.tsx`, `src/components/layout/navItems.ts`.
- **F43.2 — BottomNav reducido a 4 slots + MoreDrawer eliminado:** `<BottomNav />` pasó de 5 a 4 slots fijos (Dashboard / Notas / Tareas / Inbox con badge), eliminando el slot "Más" + prop `onMoreClick` + import `MoreHorizontal`. El componente `<MoreDrawer />` se borró completamente junto con su mount/state/import en `app/layout.tsx`. Archivos tocados: `src/components/layout/BottomNav.tsx`, `src/app/layout.tsx`, `src/components/layout/MoreDrawer.tsx` (borrado).

## Decisiones clave

| ID  | Decisión                                                                                                                                          | Razón                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2  | Cleanup quirúrgico: modificar BottomNav, SidebarContent y layout.tsx; borrar MoreDrawer; preservar FAB, MobileHeader, QuickCaptureButton (TopBar) | Eliminación enfocada al wiring nav, sin tocar Captura como concepto ni repos/stores                                                                                                                                  |
| D3  | Modelo final BottomNav 4 + drawer overflow único + FAB primary action                                                                             | Combo validado por NN/g (uso 86% combo vs 57% solo hamburger). Material 3: la primary action no se repite. Slot "Más" iOS-style redundante si ya hay drawer overflow                                                 |
| D5  | Inbox fusionado en sección "Ejecución" posición 2 (post-Dashboard)                                                                                | Cambio mínimo en `navItems.ts`. Promover Inbox a "suelto sin header" requería refactor de SidebarContent (flag `renderHeader?`); fusión es más simple. Posición 2 sigue flujo CODE: capture → process → execute      |
| D6  | Tablet (768-1023px) y desktop con sidebar visible quedan solo con shortcut Alt+N para QuickCapture                                                | TopBar QuickCaptureButton solo se renderiza con `sidebarHidden=true` (desktop); FAB solo en mobile. Trade-off aceptado por uso minoritario en tablet; desktop tiene toggle sidebar para llegar a TopBar si necesario |

## Lecciones

- **`<SidebarContent />` es shared cross-platform.** El wrapper `<NavigationDrawer />` mobile delega TODO el contenido a `<SidebarContent />`, que también compone el wrapper `<Sidebar />` desktop. Cuando un cleanup parece "mobile-only", verificar primero si el wrapper drawer es delgado o si tiene UI propia. Si delega, el cambio cruza plataformas por construcción — ajustar scope antes de pretender un split mobile-vs-desktop.
- **`<FAB />` posición es invariante al slot count del BottomNav.** Usa `bottom: calc(80px + 16px + var(--sai-bottom))` con altura BottomNav fija (`calc(64px + var(--sai-bottom))`), no depende del número de slots. Trampa potencial: cambios futuros que asuman el FAB se posiciona "sobre el último slot" — falso, se posiciona sobre la altura completa de la nav.
- **Regla operativa al limpiar drawers: ninguna sección con un único hijo.** Cuando un cleanup deja una sección con 1 item, fusionar a sección vecina es más simple que refactorizar la API de NavSection para soportar "sección sin header". La fusión es 1 edit en config; el refactor toca el componente que itera + agrega flag.
- **Tablet (768-1023px) en SecondMind no tiene FAB ni TopBar QuickCaptureButton.** Cualquier acción global debe estar accesible desde sidebar collapsed (icono) o vía shortcut. Si una feature futura introduce una primary action global, considerar gating cross-tablet o aceptar shortcut-only desde el arranque.
- **Alt+N perdió discoverability en desktop con sidebar visible post-F43.** El kbd hint `Alt+N` vivía dentro del CTA eliminado. Si en producción surge feedback de usuarios desktop que no descubren el shortcut, escalar como follow-up: tooltip en hamburguesa, kbd hint discreto en footer del drawer, o re-introducir un hint visual mínimo no-CTA.
- **Plan agent + 3 Explore agents en paralelo + Playwright métricas en mismo Phase 1** cubrió wiring multi-archivo + audit de gotchas + validación numérica de tap targets en una sola ronda. El layout F43 (3 sub-sistemas distintos: BottomNav, NavigationDrawer/SidebarContent, FAB) era candidato natural para 3 Explore en paralelo; el Plan agent validó la propuesta consolidada antes de escribir el plan file. Patrón replicable cuando una feature toca 3+ áreas independientes.
