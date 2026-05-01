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
