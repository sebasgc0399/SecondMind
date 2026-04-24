# SPEC — Feature 13: GitHub Actions Node 24 migration

> Alcance: Migrar actions del workflow de release a versiones Node 24 ready antes del switch forzado 2026-06-02.
> Dependencias: Ninguna
> Estimado: 1 sesión (~1h, incluida validación RC)
> Stack relevante: GitHub Actions workflow YAML

## Objetivo

GitHub fuerza Node 24 como default en Actions runners el 2026-06-02; Node 20 se remueve el 2026-09-16. El workflow `.github/workflows/release.yml` usa 3 actions deprecadas (`checkout@v4`, `setup-node@v4`, `setup-java@v4`) que rompen post-switch si no se migran. Esta feature actualiza los 4 actions gestionables (incluye pin hygiene de `tauri-action@v0 → v0.6.2`) y agrega un prerelease guard para tags `-rc`/`-beta`, permitiendo validar cambios futuros del pipeline sin distribuir a usuarios reales.

## Features

### F1: Bump de los 3 actions deprecated

**Qué:** Actualizar las 3 actions afectadas por el warning de Node 20 a versiones que corran en Node 24 nativo.

**Criterio de done:**

- [ ] `actions/checkout@v4` → `@v5` (ambos jobs: release-tauri línea 15, release-capacitor línea 70)
- [ ] `actions/setup-node@v4` → `@v5` (ambos jobs: línea 18, línea 75)
- [ ] `actions/setup-java@v4` → `@v5` (solo release-capacitor, línea 84)
- [ ] Próximo workflow run no dispara warning de Node 20 deprecation

**Archivos a modificar:**

- `.github/workflows/release.yml` — 5 líneas (`uses:`)

**Notas de implementación:**

- No cambiar `with: node-version:` (release-tauri: 20, release-capacitor: 22). Eso es el runtime Node que la action PROVEE al job, distinto del Node en que la action corre. El warning es sobre esto último.
- `setup-node@v5` agregó auto-caching con `packageManager` field en package.json; SecondMind no define ese field, comportamiento de caching no cambia.
- Bump mínimo intencional (`@v5`, no `@v6`). `setup-node@v6` limita caching a npm only — sin impacto práctico pero evita absorber cambios no relacionados al Node 24 constraint.

### F2: Pin tauri-action@v0 a @v0.6.2

**Qué:** Cambiar `tauri-apps/tauri-action@v0` (moving pointer) a `@v0.6.2` (inmutable).

**Criterio de done:**

- [ ] `uses: tauri-apps/tauri-action@v0.6.2` en release-tauri (línea 51)
- [ ] Run del workflow (F4) completa release-tauri con MSI + NSIS + latest.json sin regresiones

**Archivos a modificar:**

- `.github/workflows/release.yml` — 1 línea

**Notas de implementación:**

- `tauri-action` no apareció en el warning de GitHub porque `@v0` → v0.6.0+ ya usa Node 24 nativo desde nov 2024. Bump no es correctivo, es hygiene.
- Pinear a tag inmutable evita regresiones silenciosas en un minor futuro de tauri-action. `Firebase-Distribution-Github-Action@v1.7.1` ya sigue este patrón.

### F3: Prerelease guard para tags -rc/-beta

**Qué:** Reemplazar el hardcoded `prerelease: false` del step Build & Release Tauri por un cómputo dinámico que marque como pre-release los tags con sufijo `-rc` o `-beta`.

**Criterio de done:**

- [ ] Step `Build & Release Tauri` usa `prerelease: ${{ contains(github.ref_name, '-rc') || contains(github.ref_name, '-beta') }}` (reemplaza línea `prerelease: false`)
- [ ] Validado en F4: tag `v0.1.8-rc1` crea GitHub Release marcado "Pre-release" en la UI
- [ ] `/releases/latest/download/latest.json` sigue devolviendo v0.1.7 durante el test RC (updater no recoge el pre-release)
- [ ] Tags normales (`vX.Y.Z` sin sufijo) siguen disparando auto-updater (prerelease computado a false)

**Archivos a modificar:**

- `.github/workflows/release.yml` — 1 línea

**Notas de implementación:**

- Guard solo en `release-tauri`. El job `release-capacitor` sube a App Distribution grupo `owner` — el único tester actual es el owner, no vale separar pre-releases allí.
- El endpoint de Tauri updater (`/releases/latest/...`) es resuelto por GitHub al último release NON-prerelease, comportamiento default. No requiere config adicional.

### F4: Validación E2E con RC tag

**Qué:** Correr el workflow completo con `v0.1.8-rc1` desde la feature branch para validar que F1+F2+F3 funcionan antes de mergear a main.

**Criterio de done:**

- [ ] F1+F2+F3 pusheados a `feat/actions-node24-migration` (no mergeados a main aún)
- [ ] `git tag v0.1.8-rc1 && git push origin v0.1.8-rc1` desde la feature branch
- [ ] Workflow run termina con ambos jobs `success` en `gh run view`
- [ ] GitHub Release `v0.1.8-rc1` visible en la UI con badge "Pre-release"
- [ ] `gh release view --json isLatest` del latest → sigue siendo v0.1.7
- [ ] APK en Firebase App Distribution notificado al grupo `owner`
- [ ] MSI + NSIS + latest.json presentes en el Release v0.1.8-rc1 (no hace falta instalar)
- [ ] Sin annotations de Node 20 deprecation en el run
- [ ] Cleanup: `gh release delete v0.1.8-rc1 --cleanup-tag --yes` (borra Release + tag remoto atómicamente)

**Archivos a modificar:**

- Ninguno (solo comandos git + gh)

**Notas de implementación:**

- Taggear desde la feature branch, no desde main: el workflow corre contra el commit con los bumps sin requerir merge previo. Si F4 descubre breakage, se corrige en la misma branch antes del merge.
- `v0.1.8-rc1` no es "la versión 0.1.8 real" — los 5 archivos de versión del proyecto siguen en 0.1.7 durante F4. El tag es operacional, no referenciado por el código del bundle.

## Orden de implementación

1. **F1 + F2** (mismo commit) — cambios mecánicos en 5 líneas. Mensaje: `feat(ci): bump actions a versiones Node 24 ready`.
2. **F3** (commit separado) — cambio de comportamiento (prerelease dynamic), merece un commit independiente para mantener historia atómica. Mensaje: `feat(ci): prerelease guard para tags -rc/-beta`.
3. **F4** — validación E2E. Depende de F1+F2+F3 pusheados. No commitea código; es ejecución + verificación + cleanup.
4. **Merge** `--no-ff` a main post-F4 success.

## Decisiones técnicas

### D1: Bump a @v5, no @v6

- **Opciones:** `setup-node@v5` vs `@v6`, `checkout@v5` vs `@v6`.
- **Decisión:** `@v5`.
- **Razón:** `@v5` es el bump mínimo que satisface Node 24. `@v6` introduce cambios adicionales (caching restringido a npm en setup-node@v6, cambios menores en checkout@v6) sin beneficio concreto. Regla: bump mínimo que cumple el constraint, evita absorber cambios no relacionados.

### D2: Prerelease guard solo en release-tauri

- **Opciones:** Separar pre-releases en un path distinto de App Distribution vs mismo grupo `owner`.
- **Decisión:** Mismo grupo.
- **Razón:** Único tester actual = owner. Diferenciar es scope creep sin problema real. Si el base de testers crece, es decisión de ese momento.

### D3: Validación vía RC tag, no workflow_dispatch

- **Opciones:** `workflow_dispatch` (manual sin tag) vs RC tag + cleanup.
- **Decisión:** RC tag.
- **Razón:** `workflow_dispatch` no cubre el path completo — crear GitHub Release requiere tag real, APK versionCode deriva del tag. RC tag + cleanup valida 100% del pipeline al costo de 2 comandos extra (`gh release delete`).

## Checklist de completado

- [ ] `.github/workflows/release.yml` con 4 bumps + prerelease guard
- [ ] Run de `v0.1.8-rc1` termina ambos jobs `success`, sin warnings Node 20
- [ ] Latest non-prerelease público sigue siendo v0.1.7 durante F4
- [ ] Release y tag `v0.1.8-rc1` eliminados post-validación
- [ ] Merge a main con mensaje descriptivo
- [ ] `Spec/ESTADO-ACTUAL.md` sección "Auto-Updater + Releases" actualizada con gotcha del prerelease guard (patrón RC-tag para validar workflow changes sin afectar users)

## Siguiente fase

Ninguna dedicada. Próxima feature del backlog en `Spec/ESTADO-ACTUAL.md` sección "Candidatos próximos".
