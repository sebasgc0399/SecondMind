# DRAFT — Anuncio automático de release en Discord (#anuncios vía Webhook)

> **Estado:** **GO — decisiones cerradas, listo para SPEC.** Exploración para automatizar el anuncio de cada release en el canal `#anuncios` del Discord de la beta, posteando vía **Discord Webhook** como último paso del pipeline de release en GitHub Actions. **NADA implementado todavía:** no se tocó `.github/workflows/`, no se creó el webhook en Discord. Este draft reportó el estado real verificado contra el repo; Sebastián dio **GO** y aceptó las 3 recomendaciones (2026-06-30). Próximo paso: escribir el SPEC. NO es un SPEC ni código.
>
> **Decisiones cerradas (ver §6 para detalle):** **D1 = changelog i18n en ES**; **D2 = anuncio mínimo** (versión + link) cuando no hay entrada de changelog; **D3 = skip de prereleases** (`-rc`/`-beta`).
>
> **Restricciones honradas:** Webhook (no bot), sin interacción bidireccional. **Cero dependencias nuevas** — `curl` + `jq` ya vienen en los runners `ubuntu-latest`. Sin fuente de changelog pesada inventada (P7/YAGNI).

## 1. ⚠️ D1 — Fuente de verdad del changelog (la decisión crítica)

**Verificado en el repo.** Hay tres candidatos; solo uno sirve:

| Candidato | Estado real (verificado) | ¿Sirve? |
| --- | --- | --- |
| **i18n del changelog** — `src/locales/{es,en}/translation.json` → `changelog.vXXX = { title, items[] }`, con registry en `src/lib/changelog.ts` (`CHANGELOG_ENTRIES`) | **Existe y está curada.** Es el copy **user-facing** que alimenta el modal "Novedades" in-app. Bilingüe (ES/EN). Se mantiene **por release** en el Paso 2.5 de la skill `release-ecosystem` (se appendea en el commit del bump, build-time). | ✅ **SÍ — esta es la fuente.** |
| **GitHub Release body** | **Hardcodeado**: `releaseBody: 'Release automática de SecondMind desktop. Ver commits para detalle de cambios.'` (`release.yml:61`). Es un placeholder, no un changelog real. | ❌ No (texto fijo, inútil como fuente). |
| **Commits de git** | Existen pero son técnicos/ruidosos, no escritos para usuarios. | ❌ No (no user-facing). |

**Propuesta (D1):** el anuncio lee de la **i18n del changelog**, versión **ES** (el server de beta es en español). Ejemplo real ya disponible — `changelog.v060` en `translation.json`:

```
title: "Novedades de la 0.6.0"
items:
  - "Estrenamos la búsqueda semántica: encuentra notas relacionadas por su significado…"
  - "Ya puedes descargar una copia de todo tu contenido… en un ZIP de Markdown…"
```

Esto es exactamente lo que un usuario de la beta querría leer en `#anuncios`. **No hay que crear ninguna fuente nueva** — ya existe y ya se mantiene en cada release.

**Cómo se lee en CI** (sin deps nuevas): el tag `vX.Y.Z` se normaliza a la key i18n quitando los puntos (`0.6.0` → `v060`, regla D8 del repo), y se extrae con `jq`:

```bash
KEY="v$(echo "${GITHUB_REF_NAME#v}" | tr -d '.')"            # v0.6.0 → v060
TITLE=$(jq -r ".changelog.${KEY}.title // empty"  src/locales/es/translation.json)
ITEMS=$(jq -r ".changelog.${KEY}.items[]? // empty" src/locales/es/translation.json)
```

> ⚠️ **Edge case verificado — releases SIN entrada (D2).** El Paso 2.5 de `release-ecosystem` es **condicional**: solo los releases con cambios visibles agregan entrada de changelog (invariante F60). Un release de fixes internos puede **no** tener `changelog.vXXX` → `TITLE`/`ITEMS` vacíos. **Hay que decidir qué hacer** (ver §6 D2). El plan **no** debe fallar el job ni postear un embed vacío.

## 2. Punto de enganche en el CI (con su trade-off)

**Estado real verificado.** Hay **un solo** workflow de release: `.github/workflows/release.yml`, disparado por `on: push: tags: ['v*']`. Tiene **2 jobs paralelos, sin `needs:` entre ellos**:

- `release-tauri` (windows) → buildea MSI/NSIS y **crea el GitHub Release** (vía `tauri-action`).
- `release-capacitor` (ubuntu) → buildea el APK release y lo sube a **Firebase App Distribution**.

**El 3er frente (web/PWA) NO está en este workflow.** Se deploya **manualmente ANTES del tag** (Paso 6 hosting < Paso 7 tag en `release-ecosystem`, orden crítico documentado). Es decir: **cuando este workflow corre, la web ya está live.** Gatear el anuncio sobre los 2 jobs del tag = los 3 frentes efectivamente verdes.

**Propuesta de enganche:** un **job nuevo `announce-discord` en el MISMO `release.yml`**, con:

```yaml
announce-discord:
  needs: [release-tauri, release-capacitor]   # solo corre si AMBOS pasan verde
  runs-on: ubuntu-latest
```

Un job con `needs:` **solo se ejecuta si todos sus dependencies tienen éxito** → satisface directo el requisito "no anunciar algo que falló". Es un job aislado que hace `checkout` (para leer el JSON) + un `curl` al webhook.

### Trade-off: job con `needs:` vs workflow separado `on: release: published`

| | Job `needs:` (propuesto) | Workflow `on: release: published` |
| --- | --- | --- |
| **Timing correcto** | ✅ Espera a que **ambos** frentes del tag terminen verde. | ❌ `tauri-action` publica el GitHub Release **al final de `release-tauri`**, que puede terminar **antes** que `release-capacitor` (o aunque Android **falle**) → anunciaría un release con Android roto. |
| **Simplicidad (P7)** | ✅ Un solo archivo, comparte `github.ref_name`, un step `curl`. | ❌ Archivo aparte, lógica de ordering desacoplada, más difícil de razonar. |
| **Deps** | ✅ `curl`+`jq` nativos. | ✅ iguales, pero sin ganar nada. |

→ **Gana el job `needs:`.** Es la opción correcta *y* la más simple.

> **Caveat honesto a registrar:** si `release-capacitor` falla pero `release-tauri` pasa, el **GitHub Release igual queda creado** (lo crea `tauri-action`) pero Discord **no** anuncia. Es la dirección **segura** (silencio en vez de falso-positivo): preferimos no anunciar un release a medio-publicar. Aceptable; solo dejarlo dicho.

## 3. El secreto (GitHub Secrets, no hardcodeado)

El webhook URL es secreto → **GitHub Secrets**, nunca en el YAML ni en el repo.

- **Nombre propuesto:** `DISCORD_WEBHOOK_ANUNCIOS`.
- **Uso:** `${{ secrets.DISCORD_WEBHOOK_ANUNCIOS }}`, leído a una env var del step (no interpolado directo en el comando, para no filtrarlo en logs).
- **Permisos:** el job `announce-discord` no necesita `permissions` especiales (solo sale con `curl`); declarar `permissions: {}` (least-privilege) o `contents: read` para el checkout.
- **Setup manual previo (no es código):** crear el webhook en Discord (Configuración del canal `#anuncios` → Integraciones → Webhooks → copiar URL) y pegarlo en Settings → Secrets del repo. **Esto lo hacés vos al dar GO** — el draft no lo crea.

> Guard de robustez: si el secret falta/está vacío, el step debe **no-op** (no fallar el run). Detalle de implementación menor, se resuelve en el SPEC con un `if` a nivel step leyendo la env.

## 4. Formato del mensaje (embed simple) + ejemplo de payload

Embed único: **título** con la versión, **descripción** con el título del changelog + items como bullets, **url** al GitHub Release (botón de descarga), **color** de marca (hue 285 púrpura — confirmar hex exacto contra `src/index.css`).

**Payload JSON de ejemplo** (caso v0.6.0, con entrada de changelog):

```json
{
  "username": "SecondMind",
  "embeds": [
    {
      "title": "🚀 SecondMind v0.6.0 ya está disponible",
      "url": "https://github.com/sebasgc0399/SecondMind/releases/tag/v0.6.0",
      "description": "**Novedades de la 0.6.0**\n\n• Estrenamos la búsqueda semántica: encuentra notas relacionadas por su significado, aunque no usen las mismas palabras.\n• Ya puedes descargar una copia de todo tu contenido en un ZIP de Markdown, listo para Obsidian o Logseq.\n\n[Ver el release y descargar →](https://github.com/sebasgc0399/SecondMind/releases/tag/v0.6.0)",
      "color": 9145590
    }
  ]
}
```

El step en CI arma ese JSON con `jq` (para escapar el changelog de forma segura — comillas, saltos de línea) y lo postea:

```bash
PAYLOAD=$(jq -n --arg title "🚀 SecondMind ${GITHUB_REF_NAME} ya está disponible" \
                --arg url "https://github.com/sebasgc0399/SecondMind/releases/tag/${GITHUB_REF_NAME}" \
                --arg desc "$DESCRIPTION" \
  '{username:"SecondMind", embeds:[{title:$title, url:$url, description:$desc, color:9145590}]}')
curl -sS -H "Content-Type: application/json" -d "$PAYLOAD" "$DISCORD_WEBHOOK_ANUNCIOS"
```

(`DESCRIPTION` se construye desde `TITLE` + `ITEMS` de §1; usar `jq -n --arg` evita inyección/escapes rotos. Discord embed `description` admite ~4096 chars — sobra para 2-4 bullets.)

## 5. Pasos de implementación (cuando haya GO)

1. **Setup manual (Sebastián):** crear webhook en `#anuncios` → guardar `DISCORD_WEBHOOK_ANUNCIOS` en GitHub Secrets.
2. Agregar job `announce-discord` a `release.yml` con `needs: [release-tauri, release-capacitor]`, `runs-on: ubuntu-latest`.
3. Steps del job: `checkout` → derivar `KEY` del tag → `jq` lee `title`/`items` de `translation.json` (ES) → construir `DESCRIPTION` con fallback (D2) → guard de prerelease (D3) → `curl` al webhook (secret vía env).
4. **Prueba sin spamear `#anuncios`:** crear un webhook **temporal** en un canal de pruebas, correr el job apuntado a ese, validar el embed, y recién entonces apuntar al secret real. (O `workflow_dispatch` manual con un tag de prueba.)
5. Verificar en un release real (o re-disparo) que el anuncio aparece solo tras ambos frentes verdes.
6. Cerrar: documentar el nuevo paso en la skill `release-ecosystem` (Paso 11 — "el anuncio es automático, no postear a mano").

## 6. Decisiones (CERRADAS — GO 2026-06-30)

- **✅ D1 — Fuente del changelog: i18n en ES.** Se lee `changelog.vXXX` de `src/locales/es/translation.json` (§1). No EN, no ambos — el server de beta es en español.
- **✅ D2 — Releases sin entrada de changelog: anuncio mínimo.** Cuando `changelog.vXXX` no existe (Paso 2.5 condicional), postear igual un embed **mínimo** ("Nueva versión vX.Y.Z disponible" + link al Release, sin bullets). El release ocurrió → se anuncia. NO se hace skip total ni se postea embed vacío.
- **✅ D3 — Prereleases: skip.** Los tags `-rc`/`-beta` (marcados `prerelease` en el workflow) **no** se anuncian en `#anuncios`. El job debe guardar explícitamente contra esos sufijos (además, un `-rc` tampoco matchea key i18n, así que sin el guard caería en D2 — el skip explícito lo corta antes).
- **Pendiente menor (no bloquea SPEC):** confirmar el hex de marca exacto desde `src/index.css` (hue 285) para el `color` del embed; hoy el ejemplo usa `9145590` (≈ púrpura) como placeholder.

## 7. Referencias cruzadas (archivos reales verificados)

- **Workflow de release:** `.github/workflows/release.yml` (jobs `release-tauri` línea 9, `release-capacitor` línea 66; releaseBody hardcodeado línea 61).
- **Fuente de changelog:** `src/lib/changelog.ts` (registry `CHANGELOG_ENTRIES`), `src/locales/es/translation.json` + `src/locales/en/translation.json` (`changelog.vXXX`).
- **Flujo de release + Paso 2.5 (changelog condicional) y orden hosting-antes-del-tag:** `.claude/skills/release-ecosystem/SKILL.md` (Pasos 2.5, 6, 7).
- **Normalización de key (sin puntos, D8):** comentario en `src/lib/changelog.ts`.
- **No hay** `CHANGELOG.md` en el repo (verificado: `find -iname CHANGELOG*` vacío) — confirma que la i18n es la única fuente estructurada.
