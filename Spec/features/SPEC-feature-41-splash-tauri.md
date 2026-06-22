# SPEC — Splash Tauri Desktop (hide-until-ready) (Registro de implementación)

> Estado: Completada Mayo 2026 — mergeada a `main` (`6854a1f`) y liberada en v0.2.8 (`ab5a80c`).
> Commits: `ca9554d` feat(tauri): splash branded con hide-until-ready de main window, `6854a1f` Merge feat/splash-tauri-f41 → main, `deb6479` chore(release): bump 0.2.7 → 0.2.8, `ab5a80c` Merge chore/release-v0.2.8.
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md` (+ `Spec/gotchas/tauri-desktop.md`)

## Objetivo

Eliminar el flash blanco entre que la window Tauri (Windows MSI/NSIS prod o `npm run tauri:dev`) aparece y que React + `<AppBootSplash>` termina el primer paint. El usuario ve directamente el branded splash desde el primer frame visible — equivalente desktop del problema que F40 atacó en Android.

Síntoma previo: window en blanco ~50–300ms en cold start prod, hasta ~1–3s con bootstrap auth + hidratación TinyBase.

## Qué se implementó

- **F1 — Hide-until-ready de main window (Estrategia A):** la main window arranca oculta (`"visible": false`) y se revela tras el primer mount del Layout vía `showMainWindow()` (`main.show() + unminimize() + setFocus()`). El WebView monta React + `<AppBootSplash>` (logo 174px + "SecondMind" sobre `bg-background`) mientras la window está oculta, de modo que el primer frame visible YA contiene el branded splash. Reusa `<AppBootSplash>` y el patrón idempotente module-scope de F40. El gate `bootSplashMinElapsed` (800ms, F40) garantiza perceptibilidad incluso en cold starts rápidos. Estrategias B (show post-bootstrap completo) y C (HTML inline en `index.html`) descartadas en audit por degradar UX o duplicar lógica de splash. Archivos tocados: `src-tauri/tauri.conf.json` (main window `"visible": false`; capture window unchanged), `src/lib/tauri.ts` (`showMainWindow()` + flag `mainWindowShown` module-scope + try/catch defensivo), `src/hooks/useHideSplashWhenReady.ts` (call `void showMainWindow()` en el mismo `useEffect` post-paint que ya disparaba `hideSplash()` para Capacitor — handoff cross-platform unificado; ambas no-op en web), `src/main.tsx` (bloque `if (isTauri())` con `setTimeout(() => void showMainWindow(), 5000)` como safety net, paralelo al `if (isCapacitor())` de F40).

## Decisiones clave

| Decisión                                                 | Resolución                                                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — `useEffect` vs `useLayoutEffect`/RAF para el reveal | `useEffect` aceptable; no emergió necesidad de mover a RAF.                                                                                                                        |
| R2 — orden de registro de `tauri-plugin-window-state`    | Verificado pre-implementación: ya está antes del setup callback en `lib.rs`.                                                                                                       |
| R3 — single-instance race con cold start                 | Aceptado como edge case raro; si feedback lo eleva, fix complejo (race setup Rust vs mount React) diferido a F42.                                                                  |
| R4 — HMR borra el flag idempotente                       | Aceptable: el plugin Tauri hace `show()` idempotente del lado Rust.                                                                                                                |
| R5 — `setFocus()` en el safety timeout roba foco         | Aceptable: solo ocurre en bootstrap fallido (UX ya degradada).                                                                                                                     |
| Diff stat (22 netas vs ~12 estimadas)                    | Diferencia por comentarios que documentan el dual-platform pattern y el rationale del safety timeout ("comentar el WHY no obvio"); el bytecount funcional sigue siendo ~12 líneas. |

## Lecciones

- **Hide-until-ready es el patrón canónico Tauri 2.x contra el flash blanco entre la window OS y el primer paint React** — `"visible": false` en `tauri.conf.json` + `showMainWindow()` idempotente desde un `useEffect` post-paint del Layout. Escalado a `Spec/gotchas/tauri-desktop.md` (post-F41). La idempotency module-scope (`mainWindowShown`) es obligatoria: cubre StrictMode dev double-mount, `tauri-plugin-single-instance` `show()` desde Rust en 2da instancia mid-cold-start, y HMR full-reload.
- **El reveal trigger debe colgar del primer mount, no del fin del bootstrap** — mostrar la window post-paint del Layout (no post-bootstrap auth + hidratación) maximiza la percepción del branded splash y evita la window invisible durante 1–3s. La Estrategia B (show post-bootstrap) y la C (HTML inline en `index.html`) se descartaron por degradar UX o duplicar la lógica del splash.
- **El safety net es no-negociable cuando la window arranca oculta** — un `setTimeout(5000)` paralelo garantiza que la window aparezca aunque el Layout nunca monte (crash pre-mount, bootstrap colgado); sin él, un fallo deja un `.exe` invisible para siempre. Es idempotente con el reveal normal vía el mismo flag module-scope.
- **`useHideSplashWhenReady` es el handoff cross-platform unificado** — un solo hook dispara `hideSplash()` (Capacitor) y `showMainWindow()` (Tauri), ambos no-op en web. Pareja directa con el splash móvil de F40; cualquier plataforma futura con boot splash branded debería engancharse al mismo punto post-paint.
