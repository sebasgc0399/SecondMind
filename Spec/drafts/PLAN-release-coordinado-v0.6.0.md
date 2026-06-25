# Plan del Release Coordinado — SecondMind v0.6.0

> **Propósito:** secuencia metódica para el primer deploy a producción del toggle de búsqueda semántica (SPEC-66), el export de contenido (SPEC-67), el registro de consentimiento server-side (SPEC-68), y la publicación del ToS + Política de Privacidad.
>
> **Cómo se usa:** Claude Code ejecuta paso a paso. En cada **CHECKPOINT** para y trae el resultado a Claude web para GO/NO-GO antes de seguir. Apoyarse en la skill `ecosystem-release` (CLI) para la mecánica de bump/tag/cache — NO reinventar esa secuencia.
>
> **Estado de partida verificado:** ramas mergean limpio; 3 functions nuevas + 1 regla sin deployar; deploy es seguro (toggle inerte hasta el ack, doc de consent 404 en prod); 22 embeddings viejos de la cuenta de prueba sin ack-proof (se purgan en el Paso 0); decisión legal tomada (lanzar beta gratuita con los borradores; abogado = gate pre-monetización).

---

## Principios del release (no negociables)

1. **Para en cada CHECKPOINT.** Ningún paso irreversible (purga, deploy, merge a main, tag) corre sin GO explícito de Claude web sobre el resultado del paso anterior.
2. **Verificar, no asumir.** Cada deploy se verifica por su efecto real (bundle hash, `functions:list`, render), no por "el comando no dio error".
3. **Orden de dependencias DURO** (del reconocimiento): functions+rules **antes** del cliente; hosting:app **antes** del tag; push main **antes** del tag.
4. **Rollback claro.** Si un paso falla, se detiene el stream — no se sigue al siguiente. Los puntos de rollback están marcados.
5. **Los dos streams salen juntos** (decisión tomada), pero son técnicamente independientes: si uno falla, el otro puede completarse o pausarse sin corromper al otro.

---

## PASO 0 — Regularización de embeddings (ANTES de todo deploy)

**Por qué primero:** tus 22 embeddings viejos se generaron sin el mecanismo de consentimiento. La opción honesta (no falsificar un ack retroactivo) es purgarlos; se regeneran con consentimiento real cuando uses la búsqueda tras el deploy. Como son tus propios datos de prueba, no requiere OK legal de terceros.

- **0.1** Purga targeted **solo de tu uid**: `deleteAllUserEmbeddings('gYPP7NIo5JanxIbPqMe6nC3SQfE3')` — NO `purgeAllUsersEmbeddings` (que itera todos los usuarios).
- **0.2** Protocolo del script: dryRun / emulador primero si el script lo soporta; luego ejecución real contra prod acotada al uid.
- **0.3 Verificación:** confirmar post-purga que `users/{uid}/embeddings/*` quedó en 0, y que `users/{uid}/notes/*` sigue en 23 (las notas intactas).

> **CHECKPOINT 0** — Claude Code confirma: embeddings = 0, notas = 23 intactas. GO/NO-GO antes de tocar nada más.

**Rollback:** ninguno necesario (la purga es recuperable vía backfill; las notas no se tocaron).

---

## STREAM A — App (SPEC-66/67/68)

> Activa el toggle, el export y el consentimiento server-side para usuarios reales. Verificado seguro: arranca inerte hasta el ack.

### Paso A1 — Pre-deploy: estado limpio y versión

- **A1.1** Confirmar working tree limpio en `main`, sincronizado con `origin/main`.
- **A1.2** Bump atómico de versión a v0.6.0 en los 5 archivos (`package.json`, `package-lock.json` ×2, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`). Seguir la skill `ecosystem-release` para esto.
- **A1.3** Changelog `v060` fresco (apertura beta; incluye F59/F60 y lo de este release). Se crea desde cero.
- **A1.4** Si algún `npm install` movió el lockfile raíz → re-verificar el dedupe de Vite (firebase/react) y reiniciar dev server. (Gotcha conocido.)

> **CHECKPOINT A1** — versión bumpeada en los 5 archivos, changelog listo, working tree limpio. GO antes de deployar.

### Paso A2 — Deploy de functions + rules (ANTES del cliente)

**Orden duro:** el cliente nuevo invoca `markSemanticConsent` y `backfillEmbeddings`; si el cliente sale antes que las functions, esas llamadas dan `not-found` y el consentimiento no se registra.

- **A2.1** `npm run deploy:functions` — deploya las 3 nuevas: `markSemanticConsent` (callable), `onSemanticConsentChanged` (trigger), `backfillEmbeddings` (callable).
- **A2.2** `npm run deploy:rules` — la regla deny-all `consentLog/{document=**}` que el gate server-side necesita.
- **A2.3 Verificación:** `firebase functions:list` muestra 20 functions (17 viejas + 3 nuevas). Confirmar que las 3 nuevas están y en la región correcta.
- **A2.4 Verificación crítica del bug FieldValue:** las 2 CFs que reincidieron en el bug de `FieldValue`/`serverTimestamp` (`onSemanticConsentChanged`, `markSemanticConsent`) — confirmar en runtime (no solo que deployaron) que el `batch.commit` del ack escribe bien en prod. El bug rompía TODO el ack, no solo el log. Un smoke real del callable contra prod (o un test post-deploy) que ejerza el write path.

> **CHECKPOINT A2** — 20 functions deployadas, regla activa, y el write path del ack verificado en runtime (no falso-verde). GO antes del hosting.

**Rollback:** si una function falla o el ack no escribe, NO seguir a A3. Las functions viejas siguen sirviendo; el toggle no está expuesto aún (el cliente viejo no lo tiene). Diagnosticar antes de continuar.

### Paso A3 — Deploy de hosting:app (ANTES del tag)

- **A3.1** `npm run build` (build de la SPA con el cliente nuevo).
- **A3.2** `npm run deploy` (= `deploy:hosting:app`) a `app.getsecondmind.co`.
- **A3.3 Verificación por bundle HASH** (no por browser — el service worker sirve stale): confirmar que el hash del bundle deployado coincide con el build local. El toggle y el export viven en este bundle.

> **CHECKPOINT A3** — bundle nuevo en prod, verificado por hash. GO antes del tag.

**Rollback:** Firebase Hosting permite rollback al release anterior si el bundle sale roto. Las functions ya deployadas son compatibles hacia atrás (el cliente viejo no las llama).

### Paso A4 — Tag + CI nativos

**Orden duro:** push `main` ANTES del tag (el workflow clona al estado del tag); tag DESPUÉS de hosting:app (el tag hornea Tauri+Android con el dist del momento).

- **A4.1** Push `main` a origin (con el bump de versión).
- **A4.2** Crear y pushear el tag `v0.6.0` → dispara `release.yml` (Tauri Windows + Android APK en paralelo).
- **A4.3** El `versionCode` de Android (derivado del tag) gatea la purga de HTTP cache en el APK — confirmar que sube respecto al release anterior (cura el SW stale en nativo).
- **A4.4 Verificación:** los dos jobs de CI (release-tauri + release-capacitor) terminan verdes.

> **CHECKPOINT A4** — tag pusheado, CI nativos verdes, artefactos generados. Stream A completo.

---

## STREAM B — Legal (ToS + Privacy)

> Publica los documentos en la landing. Independiente del Stream A (hosting:landing no tiene relación de orden con functions/app/tag). Gate: decisión legal ya tomada (lanzar con los borradores).

### Paso B1 — Aplicar los cabos pendientes en las ramas

**Antes de mergear, cada rama necesita su fix:**

- **B1.1** `docs/privacy-policy`: aplicar el fix `{' '}` de espacios (mismo bug de `compressHTML` que el ToS — **17 boundaries** inline en riesgo, 0 fixeados hoy). Sin esto, la Privacy publicada tendrá los espacios comidos.
- **B1.2** `docs/privacy-policy`: agregar el link recíproco Privacy → `/terms` (hoy 0 refs).
- **B1.3** `Footer.astro` (en main o donde viva): agregar `<a href="/terms">Términos</a>` — hoy `/terms` queda huérfana de navegación (0 refs en los 4 branches).
- **B1.4 Fechas de publicación:**
  - `terms.astro`: reemplazar `[FECHA DE PUBLICACIÓN]` ×2 por la fecha real del día del deploy.
  - `privacy.astro`: hoy tiene `'24 de junio de 2026'` (fecha real, NO placeholder) → actualizar a la fecha del día del deploy si es distinta (ojo: puede quedar vieja).

> **CHECKPOINT B1** — fixes aplicados en las ramas, fechas puestas, render verificado localmente (Playwright) de AMBOS documentos con los espacios correctos. GO antes de mergear.

### Paso B2 — Merge a main + deploy:landing

- **B2.1** Merge `docs/tos-landing` → main (`--no-ff`). Trae `terms.astro` + el `firebase.json` con el `no-cache` de `/terms`.
- **B2.2** Merge `docs/privacy-policy` → main (`--no-ff`). Trae la Privacy pulida + los fixes de B1.
- **B2.3** (Opcional) Merge `docs/privacy-data-inventory` → main si querés que el inventario factual quede en main (no deploya nada, es doc interno).
- **B2.4** `npm run build:landing` — confirmar que `/terms.html` y `/privacy.html` se generan sin error.
- **B2.5** `npm run deploy:landing` a `getsecondmind.co`.
- **B2.6 Verificación en prod:** abrir `getsecondmind.co/terms` y `getsecondmind.co/privacy` en el navegador real — confirmar que ambos renderizan, los espacios están bien, los links cruzados funcionan (ToS→Privacy y Privacy→ToS), el footer tiene "Términos", las fechas son correctas, y el email interpola. El placeholder "En preparación" ya no está.

> **CHECKPOINT B2** — ambos documentos live en prod, verificados en el navegador real. Stream B completo.

**Rollback:** `deploy:landing` es independiente; si algo sale mal, rollback de hosting:landing al release anterior (vuelve el placeholder). No afecta la app.

---

## CIERRE — Post-release (step 8)

- **C1** Actualizar `ESTADO-ACTUAL.md`: v0.6.0 deployada, las 3 features activas, los documentos publicados. Marcar los cabos cerrados.
- **C2** Verificar que los cabos del release se cerraron: footer ✓, link recíproco ✓, fix espacios Privacy ✓, fechas ✓.
- **C3** Cabos que SIGUEN vivos (no los cierra este release):
  - **GATE pre-monetización:** abogado real sobre §12 ToS + consentimiento sensible + seudonimización post-borrado de `consentLog`. Antes de cobrar/abrir registro/escalar.
  - Smokes nativos arrastrados (no bloqueantes): features 0.5.3 en APK, botón "Borrar mi cuenta", `allowBackup`.
  - Backfill/re-consentimiento de tus propios embeddings: la próxima vez que uses la búsqueda semántica, cruzás el modal real y se regeneran con ack-proof.
- **C4** Archivar las SPECs completadas (66/67/68) como registros de implementación si no quedan cabos vivos propios.

---

## Resumen de la secuencia (vista rápida)

```
PASO 0    Purga embeddings viejos (tu uid)         → CHECKPOINT 0
─────────────────────────────────────────────────────────────────
STREAM A  A1 bump+changelog                         → CHECKPOINT A1
          A2 functions+rules (ANTES del cliente)    → CHECKPOINT A2
          A3 hosting:app (ANTES del tag, por hash)  → CHECKPOINT A3
          A4 push main → tag → CI nativos           → CHECKPOINT A4
─────────────────────────────────────────────────────────────────
STREAM B  B1 cabos en ramas (espacios, links, fecha)→ CHECKPOINT B1
          B2 merge → deploy:landing → verificar prod→ CHECKPOINT B2
─────────────────────────────────────────────────────────────────
CIERRE    C1-C4 docs + cabos vivos
```

**7 checkpoints. Ningún paso irreversible sin GO. La cuenta de prueba sos vos, así que cada verificación la podés cruzar con tu propio estado real.**
