# Guía de estilo — copy en inglés (SecondMind)

> **Propósito.** Documento de referencia durable para todo el copy en inglés de SecondMind. Nació como gate de SPEC-58 F4.1 (traducción `en` del arco i18n) y sobrevive al archivado del SPEC: aplica a cualquier string nuevo en inglés (features futuras, v2 i18n). El batch de traducción de F4.1 se produjo **contra esta guía**.
>
> **Fuente de la voz.** El copy fuente es el español (`fallbackLng: 'es'`, D8). El inglés es traducción, no fuente — pero traducción que **no debe sonar a traducción**.

## Voz

El copy español usa voseo rioplatense coloquial ("Capturá", "Dejanos", "por vos"). El equivalente inglés es una voz **en segunda persona, presente, activa, directa y cálida** — ni corporativa ni slangy.

- **Segunda persona, presente, voz activa.** Hablale al usuario de "you".
- **Imperativo para acciones.** "Capture an idea", "Save changes", "Create note".
- **Concisión por defecto.** La frase natural más corta: "Check for updates", no "Check to see if there are updates".
- **Calidez por simplicidad**, no por exclamaciones. El emoji ocasional (heredado del source) sí; los signos de exclamación en cascada no.

## Capitalización

**Sentence case por defecto en TODO.** Capitalizar solo la primera palabra + nombres propios/de feature. (Consolida el precedente de F1: `settings.appInfo.title` = "App info", `settings.appInfo.checkUpdates` = "Check for updates".)

| Elemento                      | Convención                                    | Ejemplos                                                      |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Botones / acciones            | imperativo sentence-case, **sin** punto final | "Save", "Create note", "Check for updates"                    |
| Labels / opciones             | sentence case                                 | "Auto", "Dark", "Hidden"                                      |
| Títulos de sección/página     | sentence case; feature names tal cual         | "Appearance", "Recent notes", "Settings", "Inbox"             |
| Descripciones / ayuda         | oración completa **con** punto final          | "Choose the color mode. Auto follows your system preference." |
| Estados transitorios / badges | minúscula                                     | "active", "validating…"                                       |

**Feature names que quedan capitalizados** (excepciones a sentence case): SecondMind, Inbox, Dashboard, Quick Capture, AI, Anthropic, Google, OpenAI.

## Terminología fija (canon)

Bloqueada en el dominio `entities` (batch 1 de F4.1). Todo el resto del catálogo la referencia — no inventar sinónimos.

| es                                                                 | en                                                             | nota                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------- |
| Nota/s, Tarea/s, Proyecto/s, Objetivo/s, Hábito/s                  | Note/s, Task/s, Project/s, Objective/s, Habit/s                | entidades base                        |
| Área/s · Recurso/s · Archivo (PARA)                                | Area/s · Resource/s · Archive                                  | PARA                                  |
| proyecto/área/recurso/archivo (enum PARA, IDs)                     | project/area/resource/archive                                  | minúscula; IDs fijos (D5)             |
| Fugaz/Literatura/Permanente                                        | Fleeting/Literature/Permanent                                  | fijo (D5); ya en inglés en el grafo   |
| Inbox                                                              | Inbox                                                          | sin cambio                            |
| Captura rápida                                                     | Quick Capture                                                  | feature name (capitalizado)           |
| Papelera                                                           | Trash                                                          | los paths ya dicen `/trash`           |
| Descartar (acción de inbox)                                        | Discard                                                        | verbo, distinto de Trash (sustantivo) |
| Etiqueta/s                                                         | Tag/s                                                          |                                       |
| Sin título / sin nombre                                            | Untitled                                                       | "Untitled note", "Untitled task", …   |
| Alta/Media/Baja/Urgente                                            | High/Medium/Low/Urgent                                         | prioridades                           |
| Sin clasificar · En progreso · Completado · No empezado · En pausa | Unclassified · In progress · Completed · Not started · On hold | estados (sentence case)               |
| Segundo cerebro                                                    | Second brain                                                   | término canónico (Tiago Forte)        |
| Repaso/Revisión (spaced repetition) · Pendiente/s                  | Review · Pending                                               |                                       |
| Pareja (área/hábito de vida)                                       | Relationship                                                   |                                       |
| Sin sincronizar / pendiente de sincronizar (estado sync)           | Unsynced · Unsynced changes                                    | mismo estado en toda la UI (batch 2)  |

**Labels default del dominio `entities` (fijados en batch 1 — confirmados por Sebastián):**

- **Hábitos default:** Code · Eat well · Exercise · Stretch · Gratitude · English · Read · Wake up early · Meditate · **No sweets** · Relationship · Plan the day · Make the bed · Drink water.
- **Áreas default:** Knowledge · Finance · Habits · Relationship · Projects · Health & Exercise.
- **Inbox result type** "Descartar" → **Discard** (acción); "Item sin contenido" → **Empty item**.
- **projectStatus:** el grupo "Sin clasificar" → **Unclassified**; la opción literal "Inbox" → **Inbox** (no confundir).

## Gobernanza del canon

Los batches 2–5 **consultan** esta tabla, no la re-deciden. Si un batch posterior toca un término ya fijado acá, lo usa **tal cual**. Si aparece un **término nuevo no cubierto**, se **marca para review de Sebastián** — no se inventa.

## Emojis

Conservar donde están en el source (🎉 en empty states celebratorios: "Nothing for today 🎉"). **No agregar** emojis ausentes; **no quitar** los del source.

## Gramática / puntuación

- **Oxford comma** ("notes, tasks, and projects").
- **Contracciones permitidas** (you're, don't, can't) — coherentes con el registro cálido.
- **Em dash (—)** donde el source lo usa.
- "AI" (no "A.I."); "API key" (key en minúscula).

## Plurales (i18next)

Llenar `_one` y `_other` en el catálogo en. **NUNCA `_many`** — el inglés no tiene categoría `many` en CLDR (las keys `_many` existen solo en es y son correctas). `_one` = singular ("1 task"), `_other` = plural ("{{count}} tasks").

## Seguridad de interpolación (sitios con trampa)

Resoluciones registradas en F4.1 — todas viven en el **catálogo**, sin tocar código:

- **`useNoteSuggestions` `{{type}}.toLowerCase()`** (note types interpolados): usar **"Promote to {{type}} note"** / **"…fits better as a {{type}} note."** El label minúsculo + " note" lee natural ("promote to permanent note"). El `.toLowerCase()` sirve para ambos idiomas → cero cambios en el hook.
- **Tiempo relativo por catálogo** (`objectives.deadline.*`, `editor.review.relative.*`): traducir al orden natural en — "{{date}} · in {{count}} days", "{{date}} · {{count}} days overdue", "in {{count}} weeks". El ensamblado `{{date}} · <frase>` se mantiene → cero cambios en `formatDate.ts`/`ObjectiveCard.tsx`.
- **`<Trans>` (`inbox.empty.hint` kbd, `auth.verify.body` + `auth.action.reset.forAccount` email en `<1>`):** mantener el elemento envuelto en posición media natural; **el inglés puede reordenar la frase y mover el ancla** → el email/kbd queda roto. **La verificación es render VISUAL real (F4.2), nunca por inspección del JSON** (mismo estándar que la verificación `<Trans>` con email real de F2.6).
- **Greetings** (`dashboard.greeting.*`): "Good morning/afternoon/evening" (`night` = "Good evening", contexto saludo). `{{name}}` es agnóstico de género.

## No-traducir (inglés pre-existente aprobado)

Strings que ya estaban en inglés en la UI es (SPEC-58 §excepciones a–g): "Settings", "Sign out", labels del slash-menu ("Heading 1", "Bullet List", "Code Block", …), note-types del grafo (ya "Fleeting/Literature/Permanent"). Ya correctos en en o sin cambio.

## Gate de revisión por batch

Batches 1–4: el gate es **"correcto y consistente"** (terminología, capitalización, plurales, interpolación). Batch 5 (auth/onboarding = copy de producto público): el gate es **"no suena a traducción"** — revisión más lenta; si el batch entrega algo gramaticalmente perfecto pero plano, se reescribe por encima de la sugerencia.
