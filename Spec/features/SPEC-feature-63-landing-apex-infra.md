# SPEC — Feature 63: Landing + Infra del Apex (`getsecondmind.co`)

> Estado: **Especificado, sin implementar.** Rama `feat/f63-landing-astro`. Pendiente: review del SPEC → GO a F1.
> Alcance: Landing pública de marketing en el apex `getsecondmind.co` (Astro estático), separada de la app, con `/privacy` en placeholder + migración de Firebase Hosting a multi-target.
> Dependencias: **Fase A completada** (origen de la app fijado en `app.getsecondmind.co` sobre el site `secondmind`).
> Estimado: 1–2 días (solo dev). El DNS/SSL del apex (F2) va **al final** (secuencia conservadora: la landing primero viva en `.web.app`, recién después se conecta el dominio — el apex nunca sirve vacío).
> Stack relevante: **Astro v6 estático** · Firebase Hosting (site nuevo `secondmind-landing`, multi-target) · Cloudflare DNS (manual, fuera de Claude Code).
> Pre-requisitos verificados (discovery 2026-06-20): Node local `v24.11.1` (Astro v6 exige ≥22.12) ✓ · firebase-tools `15.19.0` (soporta multi-target) ✓ · repo NO es monorepo (sin workspaces) ✓ · `.gitignore` ya ignora `landing/dist` (`dist` sin slash) ✓.

---

## Objetivo

Un visitante que llega a `getsecondmind.co` ve una landing profesional que explica qué es SecondMind y lo manda a solicitar acceso a la beta (`app.getsecondmind.co/solicitar-acceso`). El apex deja de mostrar el parking de Namecheap. La landing es un proyecto separado de la app — Astro estático zero-JS, sin React/TinyBase/SW — liviano y con buen Open Graph para que el link se vea bien al compartirlo. La app (`app.getsecondmind.co`) queda **intacta**: la migración a multi-target Hosting se valida sin tocar producción.

**Fuera de alcance (explícito):** contenido real de la privacy policy (sesión dedicada aparte); captura de emails (ya vive en el login de la app, temporal); waitlist pública; analytics de la landing; screenshots elaborados.

**Leyenda de ejecución:** **[C]** = código que hago yo · **[CLI]** = comando `firebase`/`npm` que muta estado · **[OPS]** = manual de Sebastián fuera de Claude Code (Cloudflare DNS / Firebase Console) · **[V]** = verificación read-only.

---

## Features

### F1: Site de Hosting nuevo + targets multi-site

**Qué:** Crear un site de Firebase Hosting nuevo en `secondmindv1` para la landing y migrar `firebase.json` de single-site a multi-target, para que los deploys de app y landing no se pisen. **Validar que la app sigue intacta sin re-deployar producción** (preview channel, D6).

**Criterio de done:**

- [ ] **[CLI]** Site nuevo creado: `firebase hosting:sites:create secondmind-landing` (confirmar disponibilidad global del `.web.app`; fallback `getsecondmind-landing` / `secondmind-www`).
- [ ] **[CLI]** `firebase target:apply hosting app secondmind` y `firebase target:apply hosting landing secondmind-landing` aplicados (quedan en `.firebaserc`). El site **debe existir antes** del `target:apply` (requisito del CLI).
- [ ] **[C]** `firebase.json` con array de **dos** configs de hosting (una por target), cada una con su `public` y sus `rewrites`/`headers`.
- [ ] **[C]** `package.json`: `deploy` acotado a `--only hosting:app`; agregados `build:landing` y `deploy:landing`.
- [ ] **[V]** El target `app` validado por **preview channel** sirve el **shell de la app** (gate funcional: su `index.html` + `/assets`, NO la landing ni vacío) — ver D6 y Orden paso 9–10.
- [ ] **[V]** `firebase hosting:sites:list` muestra ambos sites; `--only hosting:app` y `--only hosting:landing` deployan cada uno por separado.

**Archivos a crear/modificar:**

- `firebase.json` — `"hosting": { "site": "secondmind", ... }` → `"hosting": [ { "target": "app", ... }, { "target": "landing", ... } ]`.
- `.firebaserc` — agrega bloque `targets`.
- `package.json` — scripts `deploy` / `build:landing` / `deploy:landing`.
- `.claude/skills/release-ecosystem/SKILL.md` — Paso 6, comentario de la línea 158.

**Notas de implementación:**

- ⚠️ **GOTCHA — riesgo #1.** Post-array, `firebase deploy --only hosting` (sin `:target`) deploya **AMBOS** sites. De ahí que `package.json deploy` pase a `--only hosting:app` y que la landing tenga su `deploy:landing`. Único spot del repo con `--only hosting` pelado: el script `deploy` (se corrige) y el comentario del skill línea 158.
- **`firebase.json` resultante** — el target `app` es **copia exacta** del bloque `hosting` actual (public `dist`, rewrite `**→/index.html`, los 8 bloques de headers) cambiando solo `"site":"secondmind"` por `"target":"app"`. El target `landing`:
  - `"public": "landing/dist"`, `"cleanUrls": true`, **SIN `rewrites`** (es multipage estática, no SPA — un `**→/index.html` rompería `/privacy`).
  - headers: `**` con HSTS/nosniff/Referrer-Policy/Permissions-Policy + cache de assets (`js|css|woff2|...` immutable, imágenes 1d) + `/index.html` no-cache. **SIN** los headers de `sw.js`/`registerSW.js`/`manifest.webmanifest` (la landing no tiene PWA/SW).
  - **HSTS (D10):** copiar el valor EXACTO del patrón probado de la app (`max-age=63072000; includeSubDomains; preload`), no inventar.
- **`.firebaserc` resultante:**
  ```json
  {
    "projects": { "default": "secondmindv1" },
    "targets": {
      "secondmindv1": { "hosting": { "app": ["secondmind"], "landing": ["secondmind-landing"] } }
    }
  }
  ```
- **Skill `release-ecosystem` línea 158:** comentario `# = npm run build && firebase deploy --only hosting` → `--only hosting:app`, + nota corta de que la landing se deploya con su propio `deploy:landing` **fuera** del release coordinado (no entra al bump de versión de los 3 artefactos). Línea 165 (`Hosting URL: https://secondmind.web.app`) **NO cambia** (sigue siendo el `.web.app` de la app, fuente de verdad directa a Firebase sin Cloudflare).

---

### F2: Custom domain `getsecondmind.co` + `www` _(OPS — Sebastián)_

**Qué:** Conectar el apex y `www` al site nuevo, sacar el parking de Namecheap y fijar el canónico (apex), redirigiendo `www`. **DNS lo hace Sebastián en Cloudflare** (fuera de Claude Code, igual que Fase A); Claude entrega los valores exactos y corre las verificaciones.

**Criterio de done:**

- [ ] **[OPS Console]** `getsecondmind.co` (apex) conectado al site `secondmind-landing` vía A records de Firebase (modo Avanzado, igual que Fase A).
- [ ] **[OPS Console]** `www.getsecondmind.co` agregado al mismo site con el toggle nativo **"Redirect to getsecondmind.co"** (301). Es de Firebase Console, **no** de `firebase.json`.
- [ ] **[OPS Cloudflare]** A records de Firebase + TXT de verificación agregados, **proxy en GRIS (Solo DNS)** hasta que SSL provisione.
- [ ] **[OPS Cloudflare]** Parking de Namecheap removido: A `192.64.119.70` del apex y CNAME `www → parkingpage.namecheap.com`.
- [ ] **[V]** SSL provisionado en ambos; `https://getsecondmind.co` carga con candado.
- [ ] 🔒 **[V] MX / SPF / DKIM de `soporte@` INTACTOS** — `nslookup -type=MX` y `-type=TXT getsecondmind.co` ANTES y DESPUÉS; idénticos.

**Archivos a crear/modificar:** ninguno (es DNS + Console). Claude documenta los registros que entregue Firebase.

**Notas de implementación:**

- Mismo procedimiento que Fase A: modo Avanzado (A records), proxy Cloudflare en **gris** durante el provisioning; si algún día se prende naranja, es otro día con SSL Cloudflare **Full (Strict)**.
- El parking y el email son registros distintos: los A/CNAME del parking se borran; los MX/SPF/DKIM/DMARC **NO se tocan**. Trabajo quirúrgico.
- Tiene latencia (verificación DNS + SSL ACME, minutos a 24h). **Secuencia conservadora (elegida): F2 va AL FINAL**, recién cuando la landing ya está viva y verificada en `secondmind-landing.web.app` → el apex nunca sirve una página vacía/404; el costo es esperar el SSL al cierre. _(Alternativa descartada: conectar el dominio apenas exista el site para que el SSL cocine en paralelo — ahorra la espera final pero el apex serviría 404 un rato. Como el apex no tiene tráfico, cualquiera servía; se eligió la conservadora.)_ Mientras el cert no esté, verificar contra `secondmind-landing.web.app` (cert de Firebase ya válido).

---

### F3: Proyecto Astro + branding

**Qué:** Scaffold de Astro en `/landing` (carpeta separada del mismo repo, sub-proyecto npm propio), con las CSS vars del branding **portadas** del design-system (no importar la app).

**Criterio de done:**

- [ ] **[CLI]** `/landing` creado con `npm create astro@latest landing -- --template minimal`; `npm --prefix landing run build` genera HTML estático en `landing/dist`.
- [ ] **[C]** Tokens de branding disponibles en `branding.css`: primary `oklch(0.68 0.12 285)` (= `#878bf9`, dark), background/foreground/muted/border (light+dark), radius base `0.625rem`, motion `cubic-bezier(0.16,1,0.3,1)`, durations 150/250/400ms.
- [ ] **[C]** Geist Variable **self-hosted** (1 woff2 latin, `@font-face` absoluto) — sin dependencia de `@fontsource` ni de la app.
- [ ] **[C]** El build de la landing es independiente del de la app (no toca el `dist/` de la app ni su `package.json`/PWA).

**Archivos a crear/modificar:**

- `landing/astro.config.mjs` — `output:'static'`, `site:'https://getsecondmind.co'`, `trailingSlash:'never'`, `build.format:'file'`.
- `landing/package.json` (+ `landing/package-lock.json` commiteado) — dep única: `astro`.
- `landing/src/styles/branding.css` — subset de tokens oklch `:root`+`.dark` + `@font-face` Geist.
- `landing/src/layouts/Layout.astro` — `<head>` con props title/description/ogImage + canonical + preload font + favicons + theme-color.
- `landing/public/` — copiar `favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (de `public/`) + `fonts/geist-latin-wght-normal.woff2` (de `node_modules/@fontsource-variable/geist/files/`).

**Notas de implementación:**

- **Estilo (D9):** CSS plano + tokens portados, **sin Tailwind ni React** — self-contained liviano (el SPEC ya implica `src/styles/branding.css`). Portar **solo el subset de superficie pública** (primary/bg/fg/muted/border/radius/motion), NO los ~40 tokens de app/sidebar/chart/graph.
- **Fuente (D7):** Geist es **variable** (`font-weight: 100 900`, `format('woff2-variations')`) → un solo archivo cubre todos los pesos. `@font-face` con `url('/fonts/geist-latin-wght-normal.woff2')` + el `unicode-range` latin del paquete. `<link rel="preload" as="font" crossorigin>` en el `<head>` para evitar FOUT en el hero. El gotcha F44 (Vite no rebastea woff2 importados desde CSS) **no aplica** — Astro `output:'static'` sirve `public/` verbatim.
- **Visual:** dark, Linear/Raycast-style con radial-glow violeta (reusar el `radial-gradient` del shell de login/`solicitar-acceso`). _(Dirección redirigible en review.)_

---

### F4: Secciones de la landing _(copy DRAFT — Sebastián pule)_

**Qué:** Una página: hero + qué es + features + footer.

**Criterio de done:**

- [ ] **[C] Hero:** logo (cerebro, `public/favicon.svg`) + "SecondMind" + tagline + CTA "Solicitar acceso a la beta" → `https://app.getsecondmind.co/solicitar-acceso`.
- [ ] **[C] Qué es:** un párrafo de posicionamiento.
- [ ] **[C] Features:** 3–4 bloques.
- [ ] **[C] Footer:** `soporte@getsecondmind.co` · link a `/privacy` · © 2026.
- [ ] Copy en español, registro **voseo** (consistente con la app).

**Archivos a crear/modificar:**

- `landing/src/pages/index.astro` (+ opcional `src/components/{Hero,Features,Footer}.astro` si crece).

**Copy DRAFT (punto de partida, ajustable):**

- Tagline: _"Tu segundo cerebro que además ejecuta."_ (la app hoy usa "Tu segundo cerebro digital" — Sebastián decide cuál).
- Qué es: _"SecondMind une dos mundos que las demás herramientas separan: tu conocimiento —notas atómicas estilo Zettelkasten, links bidireccionales, un grafo navegable— y tu ejecución —tareas, proyectos, objetivos y hábitos. Un copiloto de AI conecta los puntos, sin decidir por vos."_
- Features:
  1. **Conocimiento vivo** — notas atómicas, wikilinks `[[ ]]`, backlinks, grafo navegable.
  2. **Ejecución integrada** — tareas, proyectos, objetivos y hábitos en el mismo lugar.
  3. **AI copiloto, no piloto** — sugerencias que aceptás o descartás. Vos mandás.
  4. **Tuyo y portable** — web, desktop y Android · offline-first · tus datos, tus API keys.

**Notas:** el CTA apunta al flujo de solicitud que ya existe (`src/app/solicitar-acceso/page.tsx`, ruta pública); la landing **no captura emails**.

---

### F5: Open Graph / meta / favicon

**Qué:** Meta tags, Open Graph y favicon para que el link se vea bien al compartirlo.

**Criterio de done:**

- [ ] **[C]** `landing/public/og-image.png` (1200×630, branded) generado.
- [ ] **[C]** `og:title`, `og:description`, `og:image` (absoluta), `og:url`, `og:type`, `twitter:card=summary_large_image` en `Layout.astro`.
- [ ] **[C]** `<title>`, `meta description`, canonical, favicon (cerebro) wired.
- [ ] **[V]** Al pegar `getsecondmind.co` en WhatsApp/redes, el preview muestra título + descripción + imagen correctos.

**Archivos a crear/modificar:**

- `landing/public/og-image.png` (nuevo) · `landing/src/layouts/Layout.astro` (meta/OG).

**Notas de implementación:**

- **OG image (D8):** componer un HTML branded (cerebro SVG + wordmark + tagline sobre el radial-glow + tokens reales) y **screenshotear con Playwright MCP** a viewport 1200×630 → `landing/public/og-image.png`. One-shot; se commitea el PNG. `og:image` **debe ser URL absoluta** (`https://getsecondmind.co/og-image.png`) o los scrapers la ignoran. Validar post-deploy en los debuggers de Facebook/Twitter.

---

### F6: Privacy policy — placeholder

**Qué:** Ruta `/privacy` que responde, con contenido placeholder hasta la sesión dedicada.

**Criterio de done:**

- [ ] **[C]** `getsecondmind.co/privacy` responde 200 con un placeholder ("Política de privacidad — en preparación").
- [ ] **[C]** Enlazada desde el footer.

**Archivos a crear/modificar:**

- `landing/src/pages/privacy.astro` (nuevo) · opcional `landing/src/pages/404.astro`.

**Notas:** el contenido legal real se draftea en sesión aparte (qué datos toca la app + Play Data Safety + GDPR/CCPA), se itera, se revisa con abogado. Con `cleanUrls:true` + `build.format:'file'`, `/privacy` sirve `privacy.html` sin extensión.

---

### F7: Deploy + verificación

**Qué:** Deploy al target de la landing y verificación end-to-end.

**Criterio de done:**

- [ ] **[CLI]** `npm run deploy:landing` exitoso (= `build:landing && firebase deploy --only hosting:landing`).
- [ ] **[V]** `secondmind-landing.web.app/` y `/privacy` → 200; el HTML contiene `app.getsecondmind.co/solicitar-acceso`; headers con HSTS, sin `sw.js`.
- [ ] **[V]** (post-DNS+cert) `getsecondmind.co` sirve la landing con SSL; `www` → apex 301; `og-image.png` 200.
- [ ] **[V]** La app (`app.getsecondmind.co` / `secondmind.web.app`) **intacta** — no pisada por el deploy de la landing.
- [ ] **[V]** MX/SPF/DKIM intactos (re-verificar).

**Archivos a crear/modificar:** ninguno nuevo (usa los scripts de F1).

---

## Orden de implementación

```
0.  [C]    git checkout -b feat/f63-landing-astro            ← hecho
1.  [V]    nslookup MX/TXT getsecondmind.co  (BASELINE)      ← snapshot pre-DNS (el DNS recién ocurre en 18)
2.  [V]    anotar marcadores funcionales de la app en secondmind.web.app (title, patrón /assets/index-*.js, una ruta conocida)
3.  [CLI]  firebase hosting:sites:create secondmind-landing  ← site ANTES de targets (obligatorio)
4.  [CLI]  firebase target:apply hosting app secondmind  +  landing secondmind-landing
5.  [C/CLI] scaffold Astro minimal (F3) + npm --prefix landing run build → landing/dist EXISTE (ANTES del array — gotcha b)
6.  [C]    firebase.json objeto→array (+target app/landing, HSTS copiado, landing sin rewrites)
7.  [C]    package.json (deploy→:app, +build:landing/deploy:landing)
8.  [C]    skill release-ecosystem (comentario línea 158 + nota)
9.  [CLI]  firebase hosting:channel:deploy validate-app --only app --no-authorized-domains   (PREVIEW — NO toca prod; landing/dist ya existe)
10. [V]    GATE FUNCIONAL: el preview del target app sirve el SHELL de la app (su index.html + /assets/*.js + una ruta de app resuelve por el rewrite), NO la landing ni 404/vacío. Si sirviera la landing/vacío → target app mal apuntado → DIAGNOSTICAR. (NO byte-a-byte vs prod: el drift local sin deployar es normal, no una falla.)
11. [C]    branding + Layout + secciones + copy DRAFT (F3 branding + F4)
12. [C]    OG image Playwright + meta/favicon (F5)
13. [C]    /privacy placeholder (F6)
14. [CLI]  npm run deploy:landing (F7)
15. [V]    landing viva en secondmind-landing.web.app + headers + CTA
16. ───────── HANDOFF a Sebastián ─────────
17. [OPS]  Firebase Console: add custom domain apex + www al site landing (F2)
18. [OPS]  Cloudflare: A records DNS-only (gris) + borrar parking; PRESERVAR MX/SPF/DKIM (F2)
19. [V]    GATE: nslookup MX/TXT == baseline (soporte@ vivo)
20. [V]    apex 200, www 301, og-image 200 (tras cert SSL)
```

**Por qué este orden:** F1 crea la base (site + targets). **El scaffold de Astro (F3) va ANTES del array de `firebase.json` y del preview** (paso 5 < 6/9) para que `landing/dist` exista cuando Firebase parsee la config multi-target — no depender solo del aislamiento de `--only` (gotcha b). El preview channel valida el target `app` sin tocar prod. F2 (DNS/SSL del apex) va **al final** (secuencia conservadora): el handoff DNS (17–18) ocurre cuando la landing ya está viva y verificada en `.web.app`, así el apex nunca sirve vacío; el costo es esperar el SSL al cierre. F6 es trivial; F7 cierra.

---

## Estructura de archivos

```
landing/                          ← nuevo (Astro, separado de la app)
├── astro.config.mjs
├── package.json                  ← dep propia: astro
├── package-lock.json             ← commitear (build reproducible)
├── public/
│   ├── favicon.svg               ← copia de /public
│   ├── favicon-16x16.png · favicon-32x32.png · apple-touch-icon.png
│   ├── og-image.png              ← generado (Playwright, F5)
│   └── fonts/
│       └── geist-latin-wght-normal.woff2   ← copia de node_modules/@fontsource-variable/geist/files
└── src/
    ├── layouts/Layout.astro      ← <head> meta/OG/canonical/favicons/preload
    ├── pages/
    │   ├── index.astro           ← hero + qué es + features + footer
    │   ├── privacy.astro         ← placeholder
    │   └── 404.astro             ← opcional
    └── styles/branding.css       ← tokens oklch portados + @font-face Geist

firebase.json                     ← MODIFICAR: hosting objeto → array multi-target
.firebaserc                       ← MODIFICAR: bloque targets app + landing
package.json                      ← MODIFICAR: deploy→:app, +build:landing/deploy:landing
.claude/skills/release-ecosystem/SKILL.md  ← MODIFICAR: comentario línea 158 + nota
```

---

## Definiciones técnicas

### D1 — Stack de la landing

- **Opciones:** (A) parte de la app React, (B) Astro separado, (C) HTML/CSS vanilla. **Decisión: B.**
- **Razón:** estática y pública; no necesita auth/TinyBase/SW; va a otro site/dominio. Meterla en la app obligaría a deploy doble por routing de dominio y le cargaría el bundle PWA a una página que debe abrir instantánea.

### D2 — Site de Hosting

- **Opciones:** (A) reusar el site ocioso `secondmindv1`, (B) site nuevo. **Decisión: B (`secondmind-landing`).**
- **Razón:** separación limpia app/landing; `secondmindv1` es el default viejo (deploy de abril), queda para borrar/ignorar.

### D3 — Config de Hosting

- **Decisión:** `firebase.json` multi-target (array de hosting), targets `app` y `landing`; binding por `target` (no `site`) vía `.firebaserc`.
- **Razón:** con 2+ sites, single-config arriesga deployar al site equivocado.

### D4 — Canónico

- **Decisión:** apex (`getsecondmind.co`) canónico; `www` redirige (301) vía toggle de Firebase Console.
- **Razón:** un origen canónico para SEO/marca. Firebase Hosting no hace redirect por hostname limpio en `firebase.json`; el toggle de Console es el camino nativo.

### D5 — Ubicación del código

- **Decisión:** carpeta `/landing` en el mismo repo (sub-proyecto npm propio, NO workspace).
- **Razón:** dev solo; un repo, dos builds. Evita overhead de otro repo/CI. `.gitignore` ya cubre `landing/dist` y `landing/node_modules`.

### D6 — Validación del target `app` sin tocar producción _(nuevo, post-feedback)_

- **Opciones:** (A) control-deploy real de prod + gate por hash + rollback, (B) **preview channel** del target `app`.
- **Decisión: B.** `firebase hosting:channel:deploy validate-app --only app --no-authorized-domains` → valida que el `app` target del `firebase.json` nuevo sirve la app correcta en una **URL temporal** (auto-expira), **sin tocar producción**, sin re-deploy "vacío" en el historial, y `--no-authorized-domains` para no mutar los Authorized domains de Auth. El `firebase.json` multi-target toma efecto en el próximo release real de la app, ya validado por el preview.
- **Razón:** cero ventana en prod. (A) queda como fallback (gate + `firebase hosting:rollback`), riesgo bajo si el target `app` es copia exacta — pero el preview no tiene ventana.
- **Gate FUNCIONAL, no byte-idéntico (decisión c):** el preview valida que el target `app` sirve el **shell de la app** (su `index.html` + `/assets/*.js` + una ruta de app resuelve por el rewrite), NO la landing ni vacío/404. NO se compara hash byte-a-byte contra prod: el drift local sin deployar (commits no liberados) es **normal** y dispararía falsos "diagnosticar". Para validar "el target `app` no se rompió", funcional alcanza; el byte-hash queda disponible si un boundary de release hace el drift irrelevante.
- **Gotcha (orden + flag, post-feedback b):** el **scaffold de Astro + build va ANTES** de pasar `firebase.json` a array (paso 5 < 6), para que `landing/dist` exista cuando Firebase parsee la config multi-target — así el preview no depende solo del aislamiento de `--only`. **Flag confirmado** contra `firebase hosting:channel:deploy --help` (firebase-tools 15.19.0): el `--only` del **channel deploy** toma **nombres de TARGET** (`--only app`), distinto de `firebase deploy` (que usa `--only hosting:app`) y del site ID. El deploy normal de la landing sí es `--only hosting:landing`.

### D7 — Fuente Geist en Astro _(nuevo)_

- **Decisión:** **self-hosted** — copiar `geist-latin-wght-normal.woff2` a `landing/public/fonts/` + `@font-face` absoluto en `branding.css`, NO el import de `@fontsource`.
- **Razón:** self-contained estático (requisito), path estable cacheable `immutable`, solo latin (1 archivo ~30–40KB), variable (un archivo = todos los pesos). El gotcha F44 no aplica a Astro static.

### D8 — OG image _(nuevo)_

- **Decisión:** generar `og-image.png` 1200×630 con **Playwright MCP** (HTML branded → screenshot), reusando cerebro + tokens reales.
- **Razón:** tipografía/gradiente pixel-perfect con Chromium real; asset estático one-shot. Alternativas (SVG→export con woff2 en base64, `@vercel/og`/satori) son más frágiles o overkill para 1 imagen.

### D9 — Estilo de la landing _(nuevo)_

- **Decisión:** CSS plano + tokens portados, sin Tailwind/React.
- **Razón:** self-contained liviano; el SPEC ya estructura `src/styles/branding.css`. Portar solo el subset de superficie pública.

### D10 — HSTS del apex _(nuevo, post-feedback)_

- **Decisión:** copiar el valor EXACTO de la app (`max-age=63072000; includeSubDomains; preload`), no inventar.
- **Razón + implicación documentada:** en el apex, `includeSubDomains` gobierna `*.getsecondmind.co` (incl. `app.` y subdominios futuros) → todos quedan comprometidos a HTTPS-only. Aceptable porque todo el árbol se sirve HTTPS vía Firebase. `preload` en el header **no** auto-submitea a la HSTS preload list (eso es un paso manual aparte en hstspreload.org) → reversible hasta submitear.

---

## Checklist de completado

Al terminar, TODAS verdaderas:

- [ ] Site `secondmind-landing` creado; `firebase.json` multi-target; target `app` validado por preview channel (app intacta, sin tocar prod).
- [ ] `getsecondmind.co` sirve la landing con SSL; `www` → apex 301.
- [ ] Parking de Namecheap removido; MX/SPF/DKIM de `soporte@` idénticos a antes (verificado antes/después).
- [ ] Landing con hero + qué es + features + footer, copy en voseo.
- [ ] OG/meta/favicon; preview correcto al compartir el link.
- [ ] `/privacy` responde con placeholder, enlazada en el footer.
- [ ] CTA del hero lleva a `app.getsecondmind.co/solicitar-acceso`.
- [ ] `npm run deploy` (release de la app) acotado a `--only hosting:app`; skill release-ecosystem actualizado; landing fuera del release coordinado.
- [ ] App (`app.getsecondmind.co`) intacta; landing deployada por target.

---

## Siguiente fase

**Privacy policy (sesión dedicada):** investigar qué datos toca la app (auth Google, Firestore, BYOK keys, embeddings OpenAI, PostHog futuro, cada Cloud Function) + requisitos de Play Data Safety y GDPR/CCPA → draft → iterar → revisión con abogado → reemplazar el placeholder de `/privacy`. Habilita completar la ficha de Google Play. (Pendiente paralelo: archivar `Spec/drafts/RUNBOOK-app-subdomain-DRAFT.md` al cerrar la migración completa de dominio.)
