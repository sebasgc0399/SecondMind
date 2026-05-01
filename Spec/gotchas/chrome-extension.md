# Chrome Extension

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Proyecto separado en `extension/`

Con su propio package.json, tsconfig, vite.config. No comparte build con la app principal.

## CRXJS 2.4.0 + Vite 8

Named export: `import { crx } from '@crxjs/vite-plugin'` (NO default).

## Auth: `chrome.identity.getAuthToken()` + `signInWithCredential()`

Más simple en MV3, no requiere offscreen documents.

## Firebase SDK lite

`firebase/auth/web-extension` + `firebase/firestore/lite`. Bundle total 342KB (105KB gzip). `firebase/auth/web-extension` obligatorio para MV3 — el import normal falla en service worker context.

## Items del extension se crean con `source: 'web-clip'`

Y `sourceUrl` del tab activo.

## Sin encolamiento offline

El popup es efímero, si no hay red muestra error.
