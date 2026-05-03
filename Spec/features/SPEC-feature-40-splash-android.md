# SPEC — SecondMind · F40: Splash Screen Android

> **Estado:** Implementada (Mayo 2026, branch `feat/splash-android-f40` mergeada a `main`).
> Alcance final: System splash adaptativo light/dark con icon centrado + branded React splash post-handoff con logo + texto "SecondMind".
> Stack: `@capacitor/assets`, Android SplashScreen API attrs (Android 12+), `<AppBootSplash>` React.

---

## Objetivo

Reemplazar el splash legacy (color violeta `#878bf9` sin logo, solo el ícono del launcher Android genérico) por un branded splash adaptativo. El usuario ve el branding de SecondMind desde el primer frame de carga.

---

## Resultado final implementado

Flujo en dos capas:

**Capa 1 — System splash (Android 12+ SplashScreen API):**

- Fondo `#ffffff` (light) / `#0a0a0a` (dark) via `values/colors.xml` + `values-night/colors.xml` (`splashBackground`).
- Icon centrado: `@drawable/ic_launcher_foreground` (vector drawable extraído de `public/favicon.svg`).
- Theme `AppTheme.NoActionBarLaunch` con parent `Theme.SplashScreen` y attrs canónicos:
  - `windowSplashScreenBackground=@color/splashBackground`
  - `windowSplashScreenAnimatedIcon=@drawable/ic_launcher_foreground`
  - `postSplashScreenTheme=@style/AppTheme.NoActionBar`

**Capa 2 — Branded React splash (`<AppBootSplash>`):**

- Fondo `bg-background` (Tailwind, sigue light/dark).
- Logo `<img src="/favicon.svg" />` 174px centrado absoluto (`top-1/2 left-1/2 -translate-x/y-1/2`).
- Texto `<h1>SecondMind</h1>` debajo del logo (`top-[calc(50%+7rem)]`).
- Tamaño 174px calibrado empíricamente para matchear el icon del system splash en Samsung — la teoría 192dp×0.6=115dp underestimó el visible porque sin `windowSplashScreenIconBackgroundColor` no se aplica masking circular.

**Lifecycle:**

- `useHideSplashWhenReady` simplificado: dispara `hideSplash()` en `useEffect(() => { void hideSplash(); }, [])` del Layout — al primer mount, NO al fin del bootstrap. El system splash desaparece apenas React puede pintar (incluso con `isLoading=true` el AppBootSplash ya está rendereado).
- `bootSplashMinElapsed` state (800ms timeout) asegura que el branded splash sea perceptible en cold starts rápidos (sesión persistida + stores rápidos).
- Safety timeout 5s en `main.tsx` para crash pre-mount.
- Patrón idempotente: `hideSplash()` con flag module-scope `hidden`, llamadas subsecuentes son no-op.

---

## Archivos finales

### Creados

- `src/lib/splash.ts` — `hideSplash()` idempotente.
- `src/hooks/useHideSplashWhenReady.ts` — hook que dispara hide al mount del Layout.
- `src/components/layout/AppBootSplash.tsx` — branded React splash (logo + texto centrados).
- `assets/logo.png` — copia de `public/pwa-maskable-512x512.png` (fuente para `@capacitor/assets`).
- `android/app/src/main/res/values-night/colors.xml` — `splashBackground=#0a0a0a`.

### Modificados

- `capacitor.config.ts` — bloque `SplashScreen` con `launchAutoHide: false`, `launchFadeOutDuration: 250`, `backgroundColor`, `backgroundColorDark`, `androidScaleType: 'CENTER_CROP'`, `showSpinner: false`.
- `src/main.tsx` — quita `SplashScreen.hide()` post-mount; agrega `setTimeout(() => void hideSplash(), 5000)` como safety dentro del block `if (isCapacitor())`.
- `src/app/layout.tsx` — invoca `useHideSplashWhenReady()`; `bootSplashMinElapsed` state; condición `if (isLoading || (user && isHydrating) || !bootSplashMinElapsed)` muestra `<AppBootSplash />`.
- `android/app/src/main/res/values/colors.xml` — `splashBackground=#ffffff` (reemplaza `#878bf9`).
- `android/app/src/main/res/values/styles.xml` — `AppTheme.NoActionBarLaunch` migra de `android:background="@drawable/splash"` legacy a las 3 attrs canónicas del SplashScreen API.

### Eliminados

- `android/app/src/main/res/drawable/splash.xml` — XML legacy `<layer-list>` con `@color/splashBackground` violeta.

### Generados (committeados pero inertes con la API attrs nueva)

- `android/app/src/main/res/drawable*/splash.png` (12 archivos, light + dark × 6 densidades) — generados por `@capacitor/assets` con `--logoSplashScale 0.2`. La API SplashScreen ignora estos PNGs porque ahora usa `windowSplashScreenAnimatedIcon=@drawable/ic_launcher_foreground` (vector). Quedaron committeados como respaldo histórico.

### Recovery proactivo (gotcha post-tool)

- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher{,_round}.xml` — `@capacitor/assets generate` los sobrescribió con XMLs apuntando a PNGs rasterizados (degradación visual API 26+). Restaurados inmediatamente con `git checkout HEAD -- mipmap-anydpi-v26/` para preservar los XML adaptive icon (vector drawable nítido).

---

## Desviaciones sobre el plan original

### D1 — Layout libre del splash branded NO via system splash, via React layer

**Plan original:** un solo splash con logo + texto generado como PNG via `@capacitor/assets`.

**Final:** dos capas (system splash icon-only + AppBootSplash React con logo + texto).

**Razón:** Android 12+ SplashScreen API limita el branded splash a icon centrado sobre color de fondo. No permite layout libre (logo + texto + extras). Para un branded splash estilo Anthropic/Linear (logo + nombre de la app), el "branded splash completo" se entrega via pantalla React post-bootstrap; el system splash solo cubre el primer frame con icon centrado, y el handoff debe ser seamless (icon mismo tamaño y posición entre los dos frames).

### D2 — `useHideSplashWhenReady` dispara al primer mount, NO al fin del bootstrap

**Plan original:** hook esperaba `!isLoading + stores hidratados` para llamar `SplashScreen.hide()`.

**Final:** llama `hideSplash()` en `useEffect(() => { void hideSplash(); }, [])` del Layout sin deps.

**Razón:** si el hook esperara al fin del bootstrap, el system splash taparía la pantalla React branded durante TODO el bootstrap → el handoff entre system splash y `AppBootSplash` sería invisible (un solo frame imperceptible al usuario). Llamar `hideSplash()` apenas el Layout monta asegura que el system splash desaparece cuando React puede mostrar algo (incluso si `isLoading=true`, el AppBootSplash ya está rendereado).

### D3 — Tamaño del icon en React splash calibrado empíricamente (174px), NO por teoría

**Plan original:** dejar default `--logoSplashScale 0.2` y calibrar post-QA.

**Final:** `h-[174px] w-[174px]` tras 5+ iteraciones empíricas en Samsung R5CW30T2FDV. Empezó en h-48 (muy chico), pasó por h-24, h-28, h-40, h-44, hasta llegar a 174px que matchea el system splash.

**Razón:** la teoría del masking circular `192dp × ~0.6 = 115dp visible` underestima el tamaño visible en algunos OEMs. Samsung NO aplica masking circular cuando no se especifica `windowSplashScreenIconBackgroundColor` — el icon se renderiza al canvas 288dp completo. Calibración solo posible empíricamente.

### D4 — `bootSplashMinElapsed` 800ms para perceptibilidad

**No estaba en plan original.** Agregado tras QA: en cold starts con sesión persistida + stores rápidos, el branded splash se veía un solo frame imperceptible. El timeout de 800ms asegura que sea visible siempre.

### D5 — `@capacitor/assets generate` sobrescribe `mipmap-anydpi-v26/`

**Plan original:** "Iconos del launcher también regenerados (efecto secundario benigno)".

**Realidad:** la tool reemplaza los XMLs adaptive icon (vector drawable nítido) por XMLs apuntando a PNGs rasterizados — degradación visual en API 26+ (caso mayoritario). Recovery proactivo `git checkout HEAD -- mipmap-anydpi-v26/` post-tool obligatorio. Escalado a gotcha de dominio.

### D6 — Splash drawables PNG quedan inertes con la API attrs

**Plan original:** los PNG splash drawables son la fuente del splash.

**Final:** la API SplashScreen Android 12+ usa `windowSplashScreenAnimatedIcon=@drawable/ic_launcher_foreground` (vector) en lugar de los PNG. Los PNG quedan committeados pero inertes; serían usados solo si se revirtiera el theme a `Theme.AppCompat.Light` legacy.

---

## Gotchas escalados

5 gotchas nuevos en `Spec/gotchas/capacitor-mobile.md` (referenciados en `Spec/ESTADO-ACTUAL.md` § "Capacitor Mobile"):

1. **System splash adaptativo via SplashScreen API attrs (post-F40)** — `Theme.SplashScreen` parent ignora `android:background` legacy, requiere los 3 attrs canónicos.
2. **Android 12+ SplashScreen API limita branded splash a icon centrado sobre color** — necesita pantalla React post-bootstrap para layout libre; tamaño del icon se calibra empíricamente.
3. **`useHideSplashWhenReady` dispara al primer mount, NO al fin del bootstrap** — sin esto el system splash taparía el branded React durante todo el bootstrap.
4. **`@capacitor/assets generate` sobrescribe `mipmap-anydpi-v26/ic_launcher{,_round}.xml`** — recovery proactivo post-tool con `git checkout HEAD -- mipmap-anydpi-v26/`.
5. **Samsung multi-user: `adb install` default va a user 150 (Secure Folder), no user 0** — en Samsung con DUAL_APP/Secure Folder activos pasar `--user 0` explícito en install y start.

---

## QA validado

Device: Samsung Galaxy R5CW30T2FDV (Android con DUAL_APP + Secure Folder activos).

Comandos:

```bash
adb uninstall com.secondmind.app  # evitar INSTALL_FAILED_VERSION_DOWNGRADE entre release-Play y debug
adb install -r --user 0 android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start --user 0 -n com.secondmind.app/.MainActivity
```

Casos verificados:

- ✅ Light mode: fondo `#ffffff` + logo SecondMind centrado + texto "SecondMind" debajo durante cold start. Fade out 250ms al llegar al main pixel útil.
- ✅ Dark mode: fondo `#0a0a0a` + logo + texto.
- ✅ Handoff seamless: icon del system splash y del React splash mismo tamaño y posición — el usuario ve un solo splash, no dos frames distintos.
- ✅ Fade out 250ms perceptible — sin cut abrupto.
- ✅ AppBootSplash visible mínimo 800ms — perceptible incluso en cold starts rápidos.
- ✅ `hideSplash()` idempotente — múltiples llamadas no causan error ni doble disparo del plugin.
- ✅ Iconos del launcher sin regresión — `mipmap-anydpi-v26/` restaurado preserva vector drawable adaptativo en API 26+.
