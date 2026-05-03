# SPEC — SecondMind · F40: Splash Screen Android

> Alcance: Splash adaptativo light/dark con logo SecondMind centrado al abrir la app móvil.
> Dependencias: Capacitor 8 + `@capacitor/splash-screen@^8.0.1` ya instalados.
> Estimado: 2-3 horas (incluye QA en device).
> Stack relevante: `@capacitor/assets`, `@capacitor/splash-screen`, Android resources (`drawable/`, `drawable-night/`).

---

## Objetivo

Reemplazar el splash actual (color violeta saturado sin logo, solo se ve el ícono del launcher Android) por un splash adaptativo: fondo blanco con logo centrado en modo claro, fondo `#0a0a0a` con logo centrado en modo oscuro. El usuario ve el branding de SecondMind desde el primer frame de carga, no una pantalla genérica.

---

## Features

### F1: Generar assets de splash via `@capacitor/assets`

**Qué:** Instalar la herramienta oficial de Capacitor, eliminar el `splash.xml` legacy que conflictaría con los PNGs generados, y producir splash drawables (light + dark) en todas las densidades Android desde un PNG fuente único.

**Criterio de done:**

- [ ] `@capacitor/assets` instalado como devDependency.
- [ ] `assets/logo.png` creado (copia o derivado de `public/pwa-maskable-512x512.png`, idealmente upscaleado a ≥1024px para densidades altas).
- [ ] `android/app/src/main/res/drawable/splash.xml` **eliminado** (conflicta con `splash.png` que generará la tool — Android no permite dos recursos con mismo nombre base en el mismo folder).
- [ ] `npx capacitor-assets generate --android --splashBackgroundColor "#ffffff" --splashBackgroundColorDark "#0a0a0a"` corre sin errores.
- [ ] Existen `splash.png` en `drawable/`, `drawable-mdpi/`, `drawable-hdpi/`, `drawable-xhdpi/`, `drawable-xxhdpi/`, `drawable-xxxhdpi/`.
- [ ] Existen `splash.png` en `drawable-night/` y densidades `night-*` con fondo oscuro.
- [ ] `android/app/src/main/res/values/styles.xml` revisado: el theme del launch screen referencia `@drawable/splash` (default Capacitor) y no apunta a otro recurso huérfano.
- [ ] Iconos del launcher también regenerados (efecto secundario benigno).

**Archivos a crear/modificar:**

- `package.json` — agregar `@capacitor/assets` en devDependencies.
- `assets/logo.png` — copia/upscale del logo source (nuevo directorio).
- `android/app/src/main/res/drawable/splash.xml` — **eliminar**.
- `android/app/src/main/res/drawable*/splash.png` — generados por la tool.
- `android/app/src/main/res/values/styles.xml` — verificar (probablemente sin cambios).
- `android/app/src/main/res/mipmap-*/ic_launcher*.png` — generados por la tool.

**Notas de implementación:**

- 512px como fuente es justo para xxxhdpi. Si el logo se ve pixelado en QA, regenerar desde un PNG fuente >1024px.
- `pwa-maskable-512x512.png` ya tiene padding interno (zona segura PWA), ideal para splash centrado con CENTER_CROP.
- Trackear `assets/` en git para reproducibilidad.

---

### F2: Configurar splash adaptativo + ajustar lifecycle del `hide()`

**Qué:** Activar fade out de 250ms, dejar que el plugin lea automáticamente los drawables generados según preferencia del SO, y validar que el `SplashScreen.hide()` se llama post-bootstrap (no post-mount React) para que el usuario no vea pantalla en blanco entre el splash y el primer pixel útil. Implementar el hide con patrón idempotente para que pueda invocarse desde múltiples puntos sin race conditions.

**Criterio de done:**

- [ ] `capacitor.config.ts` actualizado: `launchFadeOutDuration: 250`, `backgroundColor: '#ffffff'`, `backgroundColorDark: '#0a0a0a'`, `androidScaleType: 'CENTER_CROP'`, `showSpinner: false`.
- [ ] Eliminar `backgroundColor: '#878bf9'` previo.
- [ ] `npm run cap:sync` corre sin warnings nuevos.
- [ ] `SplashScreen.hide()` reubicado: ya no en `src/main.tsx:24` (post-mount React), sino en el punto donde el bootstrap está listo (auth resuelto + primer dato cargable). Probable lugar: dentro de `useAuth` cuando `loading === false`, o en un `useEffect` del primer componente con datos visibles.
- [ ] Patrón idempotente: una función `hideSplash()` con flag `hidden` que solo ejecuta `SplashScreen.hide()` la primera vez. Llamadas subsecuentes son no-op.
- [ ] Timeout máximo de seguridad: si `hideSplash()` no se llama en 5s, dispararlo igual desde `setTimeout` (evita splash colgado en redes lentas o errores de bootstrap). El flag idempotente evita doble invocación.

**Archivos a crear/modificar:**

- `capacitor.config.ts` — bloque `plugins.SplashScreen`.
- `src/main.tsx` — quitar `SplashScreen.hide()` de ahí.
- `src/lib/splash.ts` — **nuevo**, exporta `hideSplash()` con flag idempotente.
- `src/hooks/useAuth.ts` (o equivalente del bootstrap) — invocar `hideSplash()` post-bootstrap.

**Notas de implementación:**

```ts
// capacitor.config.ts — bloque SplashScreen
SplashScreen: {
  launchAutoHide: false,
  launchFadeOutDuration: 250,
  backgroundColor: '#ffffff',
  backgroundColorDark: '#0a0a0a',
  androidScaleType: 'CENTER_CROP',
  showSpinner: false,
},
```

```ts
// src/lib/splash.ts — patrón idempotente
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

let hidden = false;

export async function hideSplash(): Promise<void> {
  if (hidden) return;
  hidden = true;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SplashScreen.hide();
  } catch {
    // El plugin puede fallar en escenarios atípicos; la primera llamada igual
    // marca hidden=true y evita reintentos infinitos.
  }
}

// Timeout de seguridad — montarse al inicio del bootstrap.
// Si bootstrap llama hideSplash() antes, el segundo disparo es no-op.
setTimeout(() => void hideSplash(), 5000);
```

- `CENTER_CROP` es el default oficial de Capacitor (issue #1222 confirma la elección intencional). Como `@capacitor/assets` genera PNGs por densidad con logo en zona segura conservadora, no hay riesgo de recortar el logo en aspect ratios extremos.

---

## Orden de implementación

1. **F1** — sin assets generados ni splash.xml eliminado, F2 no funciona.
2. **F2** — sin config + lifecycle ajustado, los drawables existen pero no se ven bien.

---

## Estructura de archivos

```
assets/
└── logo.png                                     # NUEVO

src/
└── lib/splash.ts                                # NUEVO

android/app/src/main/res/
├── drawable/splash.xml                          # ELIMINAR
├── drawable/splash.png                          # GEN
├── drawable-mdpi/splash.png                     # GEN
├── drawable-hdpi/splash.png                     # GEN
├── drawable-xhdpi/splash.png                    # GEN
├── drawable-xxhdpi/splash.png                   # GEN
├── drawable-xxxhdpi/splash.png                  # GEN
├── drawable-night/splash.png                    # GEN
├── drawable-night-mdpi/splash.png               # GEN
├── drawable-night-hdpi/splash.png               # GEN
├── drawable-night-xhdpi/splash.png              # GEN
├── drawable-night-xxhdpi/splash.png             # GEN
└── drawable-night-xxxhdpi/splash.png            # GEN
```

(`mipmap-*/ic_launcher*.png` también se regeneran como efecto secundario.)

---

## Definiciones técnicas

### Por qué dos juegos de drawables (light + dark) en vez de un splash.xml con `@color`

- **Opciones consideradas:** (a) splash.xml con `<layer-list>` apuntando a `@color/splashBackground` + `@drawable/logo`, color cambia vía values-night/colors.xml. (b) Dos PNGs completos por densidad, uno en `drawable/`, otro en `drawable-night/`.
- **Decisión:** B (dos PNGs).
- **Razón:** `@capacitor/assets` genera B nativamente. Mantener A requiere editar splash.xml a mano + sincronizar values-night/colors.xml + el logo siempre del mismo color sobre fondos distintos puede tener problemas de contraste.

### Por qué CENTER_CROP y no FIT_CENTER

- **Opciones consideradas:** CENTER_CROP (default Capacitor), FIT_CENTER (logo escala sin recorte, con padding).
- **Decisión:** CENTER_CROP.
- **Razón:** Es el default oficial documentado por Capacitor (issue #1222 confirma la elección intencional). `@capacitor/assets` genera PNG fuente 2732×2732 con logo en zona segura conservadora — CENTER_CROP recorta márgenes vacíos, nunca el logo. FIT_CENTER causa franjas blancas/negras en aspect ratios extremos (19.5:9 phones, tablets 4:3).

### Por qué patrón idempotente con flag y no setTimeout cancelable

- **Opciones consideradas:** (a) `setTimeout` + `clearTimeout` cuando bootstrap completa antes. (b) función `hideSplash()` con flag `hidden` que solo ejecuta la primera vez.
- **Decisión:** B (idempotente).
- **Razón:** A introduce race condition (si bootstrap completa exactamente cuando dispara el timeout, ambos llaman `hide()`). B garantiza una sola invocación real al plugin sin importar el orden. Mismo costo en líneas, sin race posible.

---

## Checklist de completado

- [ ] `npm run cap:build` corre sin errores y produce APK.
- [ ] Al abrir la app en device Android (modo claro): se ve fondo blanco + logo SecondMind centrado durante el cold start.
- [ ] Al cambiar el SO a modo oscuro y reabrir: se ve fondo `#0a0a0a` + logo centrado.
- [ ] Fade out de 250ms es perceptible — no hay cut abrupto.
- [ ] El splash desaparece cuando la app está visualmente lista, no antes (no se ve pantalla en blanco intermedia).
- [ ] Si bootstrap falla o tarda >5s, splash se oculta de todas formas (no queda colgado).
- [ ] `hideSplash()` se puede llamar múltiples veces sin error ni doble disparo del plugin.
- [ ] No hay regresión visual en iconos del launcher.

---

## Siguiente fase

Posible **F41: Splash Tauri Desktop** (~80 líneas) — HTML inline en `index.html` + `appWindow.show()` post-mount, cubre el flash blanco al abrir la app de escritorio. Independiente y opcional.
