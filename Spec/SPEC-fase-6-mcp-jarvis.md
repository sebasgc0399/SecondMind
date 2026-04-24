# SPEC — SecondMind · Fase 6: MCP Server + OpenClaw ("Jarvis")

> Alcance: SecondMind expone sus datos via MCP server remoto en Cloud Run, se conecta a OpenClaw como asistente personal always-on, y 12 skills automatizadas generan briefings guardados en la app — accesible desde WhatsApp/Telegram/Terminal
> Dependencias: Fases 0–5 completadas (todas las entidades, Cloud Functions, multi-plataforma)
> Estimado: 2-3 semanas solo dev
> Stack relevante: Node.js + TypeScript, `@modelcontextprotocol/sdk`, Firebase Admin SDK, Cloud Run (GCP), OpenClaw, MiniMax M2.7

---

## Objetivo

Al terminar esta fase, Sebastian puede hablarle a su asistente "Jarvis" desde WhatsApp, Telegram o Terminal con cosas como "¿cómo va mi día?", "creame una tarea para revisar el PR de FuelControl", "¿qué notas tengo pendientes de repasar?" — y Jarvis lee/escribe directamente en SecondMind via MCP. Además, 12 skills con schedule automático (8 diarias + 2 semanales + 2 de mantenimiento) generan briefings que se guardan en SecondMind y llegan como mensaje al canal configurado.

---

## Features

### F1: Scaffold del MCP Server

**Qué:** Proyecto Node.js + TypeScript independiente que implementa un MCP server con Streamable HTTP transport. Usa `@modelcontextprotocol/sdk` para el protocolo y `firebase-admin` para acceso a Firestore. Auth via Bearer token estático (único usuario).

**Criterio de done:**
- [ ] `npm run dev` levanta el server en `localhost:3000/mcp`
- [ ] El endpoint responde al MCP handshake (`initialize` → capabilities)
- [ ] Un tool de prueba `ping` responde `{ content: [{ type: "text", text: "pong" }] }`
- [ ] Bearer token inválido retorna 401
- [ ] `npm run build` compila sin errores TypeScript

**Archivos a crear:**
- `mcp-server/package.json` — deps: `@modelcontextprotocol/sdk`, `firebase-admin`, `zod`
- `mcp-server/tsconfig.json` — ESM, strict, Node 20
- `mcp-server/src/index.ts` — Entry point: McpServer + Streamable HTTP transport
- `mcp-server/src/auth.ts` — Middleware Bearer token validation
- `mcp-server/src/firebase.ts` — Firebase Admin init con service account
- `mcp-server/src/tools/ping.ts` — Tool de prueba
- `mcp-server/Dockerfile` — Container para Cloud Run
- `mcp-server/.env.example` — `MCP_BEARER_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS`

**Notas de implementación:**
- El MCP server es un proyecto **separado** del app principal. Tiene su propio `package.json` y deploy independiente.
- Usar Streamable HTTP (spec 2025-03-26), NO el legacy HTTP+SSE. Un solo endpoint `POST /mcp`.
- Firebase Admin se inicializa con service account JSON (variable de entorno o archivo montado en Cloud Run). El userId de Sebastian se hardcodea como constante (único usuario).
- Bearer token estático almacenado como Secret en Cloud Run. No OAuth — proyecto personal de un solo usuario.

---

### F2: Read Tools — Estado del día

**Qué:** 6 tools de lectura que exponen el estado actual de SecondMind. Cada tool hace queries a Firestore via Admin SDK y retorna datos formateados como texto.

**Criterio de done:**
- [ ] `get_daily_summary` retorna tareas de hoy, inbox pendiente, hábitos, notas FSRS due — todo en un solo call
- [ ] `get_today_tasks` retorna tareas con `dueDate` = hoy, ordenadas por prioridad
- [ ] `get_overdue_tasks` retorna tareas con `dueDate` < hoy y status != completed
- [ ] `get_inbox_pending` retorna items con `status: 'pending'`, más recientes primero
- [ ] `get_habit_status` acepta parámetro `date` (YYYY-MM-DD) y retorna 14 hábitos con su estado
- [ ] `get_active_projects` retorna proyectos `in-progress` con conteo de tareas completadas/total

**Archivos a crear:**
- `mcp-server/src/tools/daily-summary.ts` — Agregación de todas las entidades
- `mcp-server/src/tools/tasks.ts` — `get_today_tasks` + `get_overdue_tasks`
- `mcp-server/src/tools/inbox.ts` — `get_inbox_pending`
- `mcp-server/src/tools/habits.ts` — `get_habit_status`
- `mcp-server/src/tools/projects.ts` — `get_active_projects`
- `mcp-server/src/lib/firestore-queries.ts` — Queries compartidas (helper para paths `users/{uid}/...`)

**Notas de implementación:**
- Todas las queries usan el path `users/{SEBASTIAN_UID}/collection`. El UID se lee de una constante de entorno.
- `get_daily_summary` es el tool más importante — combina datos de 4 colecciones en un solo response.
- Los hábitos usan IDs determinísticos `YYYY-MM-DD` dentro de cada habit doc. Los 14 hábitos están hardcodeados (ver doc arquitectura). El tool necesita saber los nombres para formatear la respuesta.
- `dueDate` en Firestore es un `number` (UNIX ms). Comparar con `startOfDay(today)` y `startOfDay(tomorrow)` para "tareas de hoy".
- Los responses deben ser **texto legible**, no JSON crudo. Ejemplo: `"📋 Tareas de hoy (3):\n• [urgent] Revisar PR #42\n• [high] Escribir tests\n• [medium] Llamar al banco"`.

---

### F3: Read Tools — Conocimiento

**Qué:** 4 tools de lectura enfocados en notas y el sistema de conocimiento.

**Criterio de done:**
- [ ] `get_fsrs_due_notes` retorna notas con `fsrsDue` ≤ ahora, con título y resumen
- [ ] `get_recent_notes` acepta parámetros opcionales `limit`, `area`, `tag` y retorna notas recientes
- [ ] `search_notes` acepta `query` (string) y busca en título, contentPlain, y aiTags
- [ ] `get_objectives_progress` retorna objetivos con sus proyectos vinculados y % de avance

**Archivos a crear:**
- `mcp-server/src/tools/notes.ts` — `get_fsrs_due_notes` + `get_recent_notes` + `search_notes`
- `mcp-server/src/tools/objectives.ts` — `get_objectives_progress`

**Notas de implementación:**
- `search_notes` en server-side NO puede usar Orama (es client-side). Para <500 notas, fetch all + `.filter()` con `.includes()` en memoria. Simple, suficiente para escala personal.
- `get_objectives_progress` hace join: para cada objetivo, contar tareas de sus proyectos vinculados.
- Los responses de notas incluyen: título, resumen AI (si existe), tags, fecha. NO incluir el content completo — es demasiado largo.

---

### F4: Write Tools

**Qué:** 6 tools de escritura que permiten crear y modificar entidades en SecondMind.

**Criterio de done:**
- [ ] `create_task` crea una tarea con name, priority, dueDate (opcional), projectId (opcional), areaId (opcional)
- [ ] `complete_task` marca una tarea como `completed` con `completedAt` = now
- [ ] `create_note` crea una nota con title, contentPlain, tags (opcional), areaIds (opcional), noteType (default: 'fleeting')
- [ ] `create_inbox_item` crea un item en inbox con rawContent y source = 'mcp-server'
- [ ] `toggle_habit` marca/desmarca un hábito para una fecha dada
- [ ] `save_briefing` guarda un briefing en Firestore (ver schema abajo)
- [ ] Todas las escrituras generan `createdAt`/`updatedAt` con `Date.now()`
- [ ] Las escrituras disparan las Cloud Functions existentes (`processInboxItem` para inbox, `autoTagNote` para notas)

**Archivos a crear:**
- `mcp-server/src/tools/create-task.ts`
- `mcp-server/src/tools/complete-task.ts`
- `mcp-server/src/tools/create-note.ts`
- `mcp-server/src/tools/create-inbox-item.ts`
- `mcp-server/src/tools/toggle-habit.ts`
- `mcp-server/src/tools/save-briefing.ts`

**Schema Firestore: `briefings/{briefingId}`**

```typescript
interface Briefing {
  id: string;                    // crypto.randomUUID()
  type: BriefingType;
  content: string;               // Markdown del briefing completo
  summary: string;               // Resumen de 1 línea para el card del Dashboard
  createdAt: number;              // Date.now() — UNIX ms, consistente con el resto del modelo
}

type BriefingType =
  | 'daily-tasks' | 'inbox-check' | 'notes-review'
  | 'task-progress' | 'habits-check' | 'projects-status'
  | 'day-closing' | 'habits-final'
  | 'weekly-planning' | 'objectives-review'
  | 'orphan-notes' | 'inbox-cleanup';
```

**Notas de implementación:**
- Las escrituras usan `admin.firestore().doc(path).set(data)` / `.update(data)`. No hay TinyBase server-side.
- Al crear inbox items, `processInboxItem` (trigger `onDocumentCreated`) se dispara automáticamente.
- Al crear notas, `autoTagNote` (trigger `onDocumentWritten`) se dispara si `aiProcessed === false`.
- `create_note` genera `id` con `crypto.randomUUID()`. Escribe `contentPlain` como content (sin TipTap JSON — notas via MCP son plain text).
- `toggle_habit`: los hábitos tienen IDs fijos (0-13). Verificar el schema exacto de cómo se almacenan los checks antes de implementar.
- Cada tool de escritura retorna confirmación con el ID: `"✅ Tarea creada: 'Revisar PR #42' (id: abc123)"`.

---

### F5: Deploy a Cloud Run

**Qué:** Containerizar el MCP server y deployar a Cloud Run en el proyecto GCP `secondmindv1`.

**Criterio de done:**
- [ ] `docker build` genera imagen funcional
- [ ] `gcloud run deploy` despliega exitosamente en Cloud Run
- [ ] El endpoint HTTPS responde al handshake MCP desde internet
- [ ] Bearer token validado desde Secret Manager
- [ ] Firebase Admin SDK se autentica con Application Default Credentials (mismo proyecto GCP)
- [ ] Las Cloud Functions existentes siguen funcionando

**Archivos a crear/modificar:**
- `mcp-server/Dockerfile` — Multi-stage build (build TS → run Node)
- `mcp-server/.dockerignore`
- `mcp-server/deploy.sh` — Script con `gcloud run deploy` + flags

**Notas de implementación:**
- Cloud Run region: `us-central1` (misma que las Cloud Functions).
- El service account del proyecto ya tiene acceso a Firestore. No necesita JSON explícito.
- Secrets: `MCP_BEARER_TOKEN` en Secret Manager, montado como env var en Cloud Run.
- Min instances: 0 (escala a cero). Max: 1 (un solo usuario).
- Memory: 256MB. CPU: 1 vCPU. Timeout: 60s.

---

### F6: Conectar OpenClaw al MCP Server

**Qué:** Configurar OpenClaw con MiniMax M2.7 como modelo, canal de messaging (Telegram o WhatsApp), y conexión al MCP server de SecondMind. Incluye el SOUL.md que define la personalidad "Jarvis".

**Criterio de done:**
- [ ] OpenClaw gateway corriendo localmente (o en server personal)
- [ ] MiniMax M2.7 configurado como modelo primario en `openclaw.json`
- [ ] Al menos un canal de messaging conectado (Telegram recomendado para arrancar)
- [ ] El MCP server de SecondMind conectado como tool en OpenClaw
- [ ] Desde el canal, enviar "¿cómo va mi día?" y recibir respuesta con datos reales de SecondMind
- [ ] Desde el canal, enviar "creame una tarea: revisar PR" y que aparezca en secondmind.web.app
- [ ] SOUL.md configurado con personalidad "Jarvis"

**Archivos a crear:**
- `openclaw/SOUL.md` — Personalidad de Jarvis (versionado en el repo de SecondMind para backup)
- `openclaw/openclaw.json.example` — Config de referencia con modelo, MCP, y defaults

**Notas de implementación:**

OpenClaw se configura en `~/.openclaw/` en la máquina donde corre el gateway. Los archivos en `openclaw/` del repo son **backups de referencia**, no el source of truth operativo.

Configuración del modelo en `openclaw.json`:
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "minimax/MiniMax-M2.7",
        "fallbacks": ["minimax/MiniMax-M2.7-highspeed"]
      }
    }
  }
}
```

Conexión MCP — OpenClaw soporta MCP servers remotos via URL. Agregar en la config:
```json
{
  "tools": {
    "mcp": [
      {
        "name": "secondmind",
        "url": "https://secondmind-mcp-XXXXX-uc.a.run.app/mcp",
        "headers": {
          "Authorization": "Bearer ${MCP_BEARER_TOKEN}"
        }
      }
    ]
  }
}
```

SOUL.md define la personalidad:
```markdown
# Jarvis — Asistente Personal de Sebastian

Eres Jarvis, el asistente personal de Sebastian. Tu fuente de verdad es SecondMind (via MCP).

## Principios
- Sé conciso, directo, sin rodeos. Sebastian habla en español.
- Usa los tools de SecondMind para TODO lo relacionado con tareas, notas, proyectos, hábitos, inbox.
- No inventes datos — si no lo encuentras en SecondMind, di que no lo encontraste.
- Al crear entidades, confirma qué creaste con el ID.

## Contexto
- Sebastian es desarrollador .NET (trabajo) y React + Firebase (proyectos personales).
- Zona horaria: Colombia (COT, UTC-5).
- SecondMind tiene: notas Zettelkasten, tareas, proyectos, objetivos, hábitos (14), inbox.
```

**Esta feature es configuración manual**, no código que genere Claude Code. Se documenta aquí para que el SPEC sea autocontenido.

---

### F7: Briefing Skills + Dashboard Card

**Qué:** 12 OpenClaw skills con schedule que generan briefings automáticos. Cada skill llama read tools del MCP, genera un resumen, lo guarda en SecondMind via `save_briefing`, y lo envía al canal de messaging. En el lado de la app, un BriefingCard en el Dashboard muestra los últimos briefings.

**Criterio de done:**
- [ ] Las 12 skills están configuradas en `~/.openclaw/workspace/skills/` con sus schedules
- [ ] Cada skill lee datos con read tools y escribe resultado con `save_briefing`
- [ ] Los briefings generados aparecen en el Dashboard de SecondMind (PWA, Tauri, Capacitor)
- [ ] El BriefingCard muestra los últimos 3 briefings (icono + tipo + summary + hora relativa)
- [ ] Click en un briefing abre modal con contenido markdown completo
- [ ] Los briefings llegan como mensaje al canal de messaging de OpenClaw

**Archivos a crear (OpenClaw skills — backups en repo):**
- `openclaw/skills/daily-tasks/SKILL.md`
- `openclaw/skills/inbox-check/SKILL.md`
- `openclaw/skills/notes-review/SKILL.md`
- `openclaw/skills/task-progress/SKILL.md`
- `openclaw/skills/habits-check/SKILL.md`
- `openclaw/skills/projects-status/SKILL.md`
- `openclaw/skills/day-closing/SKILL.md`
- `openclaw/skills/habits-final/SKILL.md`
- `openclaw/skills/weekly-planning/SKILL.md`
- `openclaw/skills/objectives-review/SKILL.md`
- `openclaw/skills/orphan-notes/SKILL.md`
- `openclaw/skills/inbox-cleanup/SKILL.md`

**Archivos a crear (app SecondMind):**
- `src/stores/briefingsStore.ts` — TinyBase store para briefings
- `src/hooks/useBriefings.ts` — Hook: últimos briefings, filtro por tipo
- `src/components/dashboard/BriefingCard.tsx` — Card en Dashboard
- `src/components/dashboard/BriefingDetailModal.tsx` — Modal con markdown renderizado
- `src/types/briefing.ts` — Interface Briefing + BriefingType

**Archivos a modificar:**
- `src/app/page.tsx` — Agregar `<BriefingCard />` al Dashboard (posición: arriba de todo)
- `src/hooks/useStoreInit.ts` — Agregar persister para briefingsStore

**Schedules de las 12 skills:**

| Skill | Schedule | Type |
|---|---|---|
| daily-tasks | L-V 6:30 AM | `daily-tasks` |
| inbox-check | L-V 7:00 AM | `inbox-check` |
| notes-review | L-V 7:30 AM | `notes-review` |
| task-progress | L-V 12:00 PM | `task-progress` |
| habits-check | Diaria 1:00 PM | `habits-check` |
| projects-status | L-V 2:00 PM | `projects-status` |
| day-closing | Diaria 9:00 PM | `day-closing` |
| habits-final | Diaria 9:30 PM | `habits-final` |
| weekly-planning | Domingo 7:00 PM | `weekly-planning` |
| objectives-review | Viernes 6:00 PM | `objectives-review` |
| orphan-notes | Miércoles 12:00 PM | `orphan-notes` |
| inbox-cleanup | Diaria 11:00 AM | `inbox-cleanup` |

**Ejemplo de skill (`daily-tasks/SKILL.md`):**

```markdown
---
name: daily-tasks
description: Briefing matutino con las tareas del día
schedule: "30 6 * * 1-5"
---

# Daily Tasks Briefing

Llama `get_today_tasks` y `get_overdue_tasks` del MCP de SecondMind.

Genera un briefing conciso:
- Tareas de hoy ordenadas por prioridad (urgent → high → medium → low)
- Tareas overdue resaltadas con ⚠️
- Total: N para hoy + N overdue
- Si no hay tareas: "Día libre de tareas 🎉"

Máximo 10 líneas.

Al terminar, SIEMPRE llama `save_briefing` con:
- type: "daily-tasks"
- content: el briefing en markdown
- summary: resumen de máximo 15 palabras
```

**Contenido de cada skill (resumen):**

| Skill | Tools que usa | Lógica clave |
|---|---|---|
| daily-tasks | `get_today_tasks`, `get_overdue_tasks` | Tareas por prioridad, overdue con ⚠️ |
| inbox-check | `get_inbox_pending` | Conteo + preview últimos 5 |
| notes-review | `get_fsrs_due_notes` | Títulos + resúmenes de notas due |
| task-progress | `get_today_tasks` | Completadas vs pendientes, % progreso |
| habits-check | `get_habit_status` | Completados/14, lista de faltantes |
| projects-status | `get_active_projects` | Estado por proyecto, ⚠️ sin avance |
| day-closing | `get_daily_summary` | Resumen ejecutivo del día completo |
| habits-final | `get_habit_status` | Último empujón: solo los que faltan |
| weekly-planning | `get_daily_summary`, `get_active_projects`, `get_objectives_progress` | Resumen semana + top 3 prioridades |
| objectives-review | `get_objectives_progress` | Estado por objetivo, sugerencia de acción |
| orphan-notes | `get_recent_notes` | Notas sin tags, sin área, sin links |
| inbox-cleanup | `get_inbox_pending` | Agrupado por antigüedad, alerta >1 semana |

**Iconos por tipo de briefing (para BriefingCard):**

| Type | Icono | Label |
|---|---|---|
| daily-tasks | 📋 | Tareas del día |
| inbox-check | 📬 | Inbox |
| notes-review | 🧠 | Notas para repasar |
| task-progress | 📊 | Progreso |
| habits-check | ☑️ | Hábitos |
| projects-status | 🚀 | Proyectos |
| day-closing | 🌙 | Cierre del día |
| habits-final | 🔔 | Hábitos — último check |
| weekly-planning | 📅 | Planning semanal |
| objectives-review | 🎯 | Objetivos |
| orphan-notes | 🔗 | Notas huérfanas |
| inbox-cleanup | 🧹 | Limpieza inbox |

**Notas de implementación:**
- Las skills se instalan copiando los `.md` a `~/.openclaw/workspace/skills/`. Los schedules se manejan via `schedule` en el frontmatter (cron syntax) — OpenClaw los ejecuta automáticamente.
- Zona horaria: Colombia (COT, UTC-5). Verificar que OpenClaw respeta TZ del sistema.
- Las skills generan briefings que se guardan en SecondMind Y se envían por el canal de messaging. El usuario ve el briefing en ambos lados.
- Retention: sin limpieza automática de briefings viejos. ~12/día × 365 = ~4380 docs/año, trivial en Firestore.
- El BriefingCard en el Dashboard muestra los últimos 3. Click abre modal con markdown.
- El Dashboard ya tiene 6 cards. BriefingCard se posiciona arriba como card destacado (info más time-sensitive).

---

## Orden de implementación

1. **F1 (Scaffold)** → Base del proyecto MCP, sin esto no hay nada
2. **F2 (Read: estado del día)** → Tools más usados, se prueban localmente con MCP Inspector
3. **F3 (Read: conocimiento)** → Complementa F2, misma estructura
4. **F4 (Write)** → Incluye `save_briefing`. Se verifica que escrituras se reflejan en reads
5. **F5 (Deploy)** → Empaqueta y sube a Cloud Run
6. **F6 (OpenClaw)** → Configuración manual: gateway + modelo + canal + MCP connection. Se prueba end-to-end: mensaje → tool call → respuesta
7. **F7 (Briefings + Skills)** → Skills scheduled + BriefingCard en Dashboard. Depende de F5 (MCP deployed) y F6 (OpenClaw operativo)

---

## Estructura de archivos

```
mcp-server/                          # Proyecto independiente
├── package.json
├── tsconfig.json
├── Dockerfile
├── .dockerignore
├── .env.example
├── deploy.sh
├── src/
│   ├── index.ts                     # Entry: McpServer + HTTP transport + auth
│   ├── auth.ts                      # Bearer token validation
│   ├── firebase.ts                  # admin.initializeApp() + Firestore ref
│   ├── lib/
│   │   └── firestore-queries.ts     # Helpers: userDoc, userCollection, startOfDay
│   └── tools/
│       ├── ping.ts                  # Health check
│       ├── daily-summary.ts         # get_daily_summary
│       ├── tasks.ts                 # get_today_tasks + get_overdue_tasks
│       ├── inbox.ts                 # get_inbox_pending
│       ├── habits.ts                # get_habit_status
│       ├── projects.ts              # get_active_projects
│       ├── notes.ts                 # get_fsrs_due_notes + get_recent_notes + search_notes
│       ├── objectives.ts            # get_objectives_progress
│       ├── create-task.ts
│       ├── complete-task.ts
│       ├── create-note.ts
│       ├── create-inbox-item.ts
│       ├── toggle-habit.ts
│       └── save-briefing.ts

# OpenClaw config (backups en repo — operativo vive en ~/.openclaw/)
openclaw/
├── SOUL.md                          # Personalidad Jarvis
├── openclaw.json.example            # Config de referencia
└── skills/
    ├── daily-tasks/SKILL.md
    ├── inbox-check/SKILL.md
    ├── notes-review/SKILL.md
    ├── task-progress/SKILL.md
    ├── habits-check/SKILL.md
    ├── projects-status/SKILL.md
    ├── day-closing/SKILL.md
    ├── habits-final/SKILL.md
    ├── weekly-planning/SKILL.md
    ├── objectives-review/SKILL.md
    ├── orphan-notes/SKILL.md
    └── inbox-cleanup/SKILL.md

# Archivos nuevos en la app SecondMind (F7 — Dashboard)
src/
├── stores/
│   └── briefingsStore.ts
├── hooks/
│   └── useBriefings.ts
├── components/dashboard/
│   ├── BriefingCard.tsx
│   └── BriefingDetailModal.tsx
└── types/
    └── briefing.ts
```

---

## Definiciones técnicas

### D1: ¿Por qué Cloud Run y no Cloud Functions HTTP?
Cloud Functions HTTP limita a 60s y no da control sobre el container. Cloud Run está en el mismo proyecto GCP, usa el mismo service account, y escala a cero. Free tier: 2M requests/mes — más que suficiente para uso personal.

### D2: ¿Por qué Bearer token estático y no OAuth?
Un solo usuario. El token se genera una vez (`openssl rand -hex 32`), se almacena en Secret Manager. OpenClaw lo envía como header en cada request MCP. Si en el futuro se necesita OAuth (ej: para conectar también a claude.ai), se evalúa entonces.

### D3: ¿Por qué proyecto separado del app principal?
Las Cloud Functions existentes son triggers de Firestore, no HTTP endpoints. El MCP server es un proceso HTTP con su propio lifecycle. Deploy independiente: `cd mcp-server && gcloud run deploy`.

### D4: ¿Por qué OpenClaw + MiniMax y no Claude Routines?
- **Canal**: OpenClaw permite hablarle al sistema desde WhatsApp/Telegram — Claude Routines solo genera output en claude.ai.
- **Always-on**: El gateway corre 24/7, no depende de abrir una app.
- **Costo**: MiniMax Plus $200/año vs funcionalidad similar en Claude Pro $240/año, con la ventaja del canal de messaging.
- **Flexibilidad**: OpenClaw es model-agnostic. Si M2.7 no rinde en algún escenario, se puede switchear a Claude API para skills específicas sin cambiar nada del MCP.
- **Skills vs Routines**: Las skills de OpenClaw son `.md` extensibles, con cron del sistema. Más control que las Claude Routines (que están en preview con límites).

### D5: ¿Por qué MiniMax M2.7 específicamente?
Modelo MoE de 230B params (10B activos) con benchmarks tier-1 en tareas agénticas. 97% de adherencia en skills complejos. Costo: ~$200/año en plan Plus (4500 req/5hrs). Velocidad: ~50-100 TPS. Para las tareas de Jarvis (leer datos, generar resúmenes, crear entidades) es más que suficiente.

### D6: ¿Búsqueda de notas — por qué filtro en memoria?
Firestore no tiene FTS nativo. Para <500 notas, fetch all + `.filter()` con `.includes()` es instantáneo. Si escala a >1000 notas, evaluar Orama server-side o extensión de Firestore.

### D7: ¿Por qué no Push Notifications (FCM)?
OpenClaw ya envía los briefings y respuestas por el canal de messaging (WhatsApp/Telegram). Agregar FCM duplica el canal de notificación sin valor adicional. Si en el futuro se quiere notificaciones nativas del OS independientes de OpenClaw, se agrega FCM como fase separada.

---

## Checklist de completado

Al terminar esta fase, TODAS estas condiciones deben ser verdaderas:

- [ ] `mcp-server/` existe como proyecto independiente con su propio `package.json`
- [ ] `npm run build` compila sin errores TypeScript
- [ ] El MCP server corre localmente y responde al handshake MCP
- [ ] Los 16 tools (10 read + 6 write) funcionan contra Firestore de producción
- [ ] El server está deployado en Cloud Run con HTTPS
- [ ] Bearer token autenticado correctamente
- [ ] OpenClaw gateway corriendo con MiniMax M2.7
- [ ] Canal de messaging conectado (Telegram o WhatsApp)
- [ ] MCP server de SecondMind conectado a OpenClaw como tool
- [ ] Enviar "¿cómo va mi día?" por messaging retorna datos reales de SecondMind
- [ ] Enviar "creame una tarea: X" por messaging resulta en la tarea visible en secondmind.web.app
- [ ] `save_briefing` guarda un briefing en Firestore visible en el Dashboard
- [ ] Las 12 skills scheduled están configuradas en OpenClaw
- [ ] Los briefings generados por skills aparecen en el Dashboard de SecondMind
- [ ] El BriefingCard muestra los últimos 3 briefings con icono, tipo, summary, hora relativa
- [ ] Click en un briefing abre modal con contenido markdown completo
- [ ] Las Cloud Functions existentes siguen funcionando sin interferencia
- [ ] El deploy del MCP server no afecta Firebase Hosting ni Cloud Functions

---

## Gotchas anticipados

1. **OpenClaw MCP remote auth** — Verificar cómo OpenClaw pasa headers de auth a MCP servers remotos. La config `headers` en la sección MCP debería funcionar, pero verificar con la documentación actual.
2. **MiniMax rate limits** — Plan Plus = 4500 req/5hrs. Una skill compleja puede usar 5-10 requests (tool calls + reasoning). Con 12 skills/día × ~8 requests = ~96 requests/día — holgado. Pero si Sebastian interactúa mucho por chat, monitorear el consumo.
3. **Streamable HTTP vs SSE** — Asegurarse de usar el spec 2025-03-26 (Streamable HTTP). OpenClaw debería soportar ambos, pero verificar compatibilidad.
4. **Firebase Admin en Cloud Run** — No necesita service account JSON si corre en el mismo proyecto GCP. Usa Application Default Credentials automáticamente.
5. **Habits schema** — Verificar exactamente cómo se almacenan los checks de hábitos en Firestore antes de implementar `toggle_habit` y `get_habit_status`.
6. **Timezone en skills** — Los schedules usan cron del sistema. Verificar que el sistema donde corre OpenClaw tiene TZ configurado en `America/Bogota` (UTC-5).
7. **Notas creadas via MCP no tienen TipTap JSON** — Solo `contentPlain`. Si se abre en el editor, TipTap debería manejar plain text gracefully. Verificar.
8. **OpenClaw gateway hosting** — Necesita correr 24/7 para skills scheduled. Opciones: PC de escritorio (si está siempre encendido), VPS barato ($5/mes), o Raspberry Pi. Si corre en la PC y se apaga, las skills no corren hasta que se encienda.
9. **MiniMax model name** — Verificar el nombre exacto del modelo en la config de OpenClaw. Podría ser `minimax/MiniMax-M2.7` o `MiniMax-M2.7` dependiendo del provider configurado.
10. **Cold start de Cloud Run** — Con min instances = 0, el primer request después de inactividad puede tardar 3-5s (arranque del container). Para uso interactivo vía chat, esto puede sentirse lento. Si molesta, subir min instances a 1 ($0 si está idle con CPU allocation = request-only).

---

## Siguiente fase

Con Fase 6 completada, SecondMind pasa de ser una app que Sebastian consulta a ser un **sistema con el que conversa desde cualquier lugar**. Jarvis lee y escribe en SecondMind, genera briefings automáticos, y está disponible 24/7 por messaging. Las siguientes iteraciones naturales serían:

- **Tools avanzados** — `move_task_to_tomorrow`, `link_notes`, `get_note_content(id)`, `reschedule_task`
- **Briefings enriquecidos** — Incluir sugerencias accionables ("Tienes 3 notas sin links — ¿querés que sugiera conexiones?")
- **Multi-model routing** — Usar M2.7 para tareas simples y Claude API para razonamiento complejo (OpenClaw soporta fallbacks por skill)
- **API triggers** — Conectar alertas externas (GitHub, Sentry) que crean inbox items via MCP
