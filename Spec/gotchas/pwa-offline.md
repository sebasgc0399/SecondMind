# PWA + Offline

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## `vite-plugin-pwa` con `generateSW` y `autoUpdate`

`navigateFallback: 'index.html'` permite SPA routing offline. `navigateFallbackDenylist: [/^\/api/, /^\/__\//]` evita interceptar rutas Firebase internas.

## TinyBase es el offline layer

Datos en memoria sobreviven pérdida de red. Persister custom (`createCustomPersister` v8) emite `setDoc` por cada cambio local; `onSnapshot` se re-arma automáticamente al reconectar y rehidrata. No se usa `enableOfflineDataPersistence()` de Firestore.

## Guards offline solo en features AI

Escrituras locales (notas, tareas, hábitos) funcionan via TinyBase. Solo "Procesar" inbox (CF + Claude) y SimilarNotesPanel (embeddings Firestore) se deshabilitan offline.

## `useOnlineStatus` usa `useSyncExternalStore`

Más correcto semánticamente que useState+useEffect para subscripciones a APIs del browser.

## `maximumFileSizeToCacheInBytes: 4MB` en workbox config

Bundle principal ~2.7MB por Reagraph/Three.js. Cuando haya code-splitting del grafo, se puede bajar.

## navigateFallbackDenylist para rutas golpeadas desde links externos (email)

Una ruta que se golpea desde un **link externo** (email de verify/reset, deep link compartido, OAuth callback) debe cargar **siempre el bundle actual desde la red**, no el `index.html` precacheado. Con `registerType: 'prompt'` el SW sirve el precache para las navegaciones (`navigateFallback: 'index.html'`); si el cliente tiene un SW viejo cacheado, ese `index.html` viejo **no conoce la ruta nueva** → React Router cae en el `*` catch-all del `Layout` y muestra un **404 dentro del app shell** (síntoma observado en el test de prod de SPEC-54: la URL `/auth/action` renderizaba el sidebar + 404 en vez de la landing standalone).

Fix: agregar la ruta al `navigateFallbackDenylist` para que sus navegaciones bypasseen el precache y vayan a la red (Firebase Hosting sirve el `index.html` actual → bundle actual). No se pierde nada offline: estas rutas necesitan red igual (llaman a Firebase Auth). Vivo en `vite.config.ts`:

```ts
navigateFallbackDenylist: [/^\/api/, /^\/__\//, /^\/auth\/action/],
```

Aplica a cualquier futura ruta hit-from-outside. **Caveat:** el denylist solo ayuda una vez que el SW que lo contiene está activo en el cliente — los clientes con un SW pre-fix necesitan un ciclo de actualización primero. Por eso conviene desplegar el denylist **antes** de que la ruta reciba tráfico externo real (en SPEC-54 se desplegó antes de que el soporte de Firebase active el callbackUri que apunta los emails a `/auth/action`).
