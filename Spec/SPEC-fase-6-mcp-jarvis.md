# SPEC — SecondMind · Fase 6: MCP Server

> Alcance: SecondMind expone sus datos vía un MCP server remoto en Cloud Run (lectura + escritura), agnóstico del cliente. El primer consumidor es Jarvis (proyecto independiente), pero el server no sabe ni depende de quién lo consume
> Dependencias: Fases 0–5 completadas (todas las entidades, Cloud Functions, multi-plataforma). **No depende de Jarvis**
> Estimado: 1-2 semanas solo dev
> Stack relevante: Node.js + TypeScript, `@modelcontextprotocol/sdk`, Firebase Admin SDK, Cloud Run (GCP)

> **Historial:** Rev. 2 (oct 2026) — Jarvis pasa a ser un proyecto independiente (repo `jarvis`, Hermes Agent + Claude). Salen de este SPEC: F6 (OpenClaw + MiniMax), F7 (12 skills de briefings + BriefingCard), `save_briefing`, los D4 y D5 de la Rev. 1 (OpenClaw vs Claude Routines y elección de MiniMax M2.7; los D4 y D5 actuales son nuevos) y los gotchas de OpenClaw/MiniMax. La conexión de Jarvis a este MCP vive en el repo `jarvis`. El nombre del archivo se conserva para no romper referencias. La Rev. 1 queda en el historial de git.

---

## Objetivo

Al terminar esta fase, SecondMind tiene un MCP server deployado en Cloud Run con 15 tools (10 de lectura + 5 de escritura) sobre los datos de Sebastian. Cualquier cliente MCP autorizado (Jarvis primero, MCP Inspector para pruebas) puede preguntar "¿cómo va mi día?", crear tareas, notas e inbox items, o marcar hábitos, y los cambios aparecen en la app en los 3 frentes (web, desktop, Android).

---

## Features

### F1: Scaffold del MCP Server

**Qué:** Proyecto Node.js + TypeScript independiente que implementa un MCP server con Streamable HTTP transport. Usa `@modelcontextprotocol/sdk` para el protocolo y `firebase-admin` para acceso a Firestore. Auth vía Bearer token estático (único usuario).

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
- `mcp-server/src/firebase.ts` — Firebase Admin init
- `mcp-server/src/lib/time.ts` — Límites de día en `America/Bogota` (ver Gotcha 3)
- `mcp-server/src/tools/ping.ts` — Tool de prueba
- `mcp-server/Dockerfile` — Container para Cloud Run
- `mcp-server/.env.example` — `MCP_BEARER_TOKEN`, `SEBASTIAN_UID`, `GOOGLE_APPLICATION_CREDENTIALS` (solo local)

**Notas de implementación:**

- El MCP server es un proyecto **separado** del app principal. Tiene su propio `package.json` y deploy independiente.
- Usar Streamable HTTP, NO el legacy HTTP+SSE. Un solo endpoint `POST /mcp`. Verificar con Context7 la versión vigente del spec MCP y del SDK antes de implementar.
- En local, Firebase Admin se inicializa con service account JSON. En Cloud Run usa Application Default Credentials (ver F5).
- El UID de Sebastian se lee de una variable de entorno (único usuario).
- Bearer token estático almacenado como Secret. No OAuth — ver D2.
- **Ningún tool, nombre ni respuesta menciona a un cliente específico** (Jarvis, Hermes, etc.). Ver D4.

---

### F2: Read Tools — Estado del día

**Qué:** 6 tools de lectura que exponen el estado actual de SecondMind. Cada tool hace queries a Firestore vía Admin SDK y retorna datos formateados como texto.

**Criterio de done:**

- [ ] `get_daily_summary` retorna tareas de hoy, inbox pendiente, hábitos, notas FSRS due — todo en un solo call
- [ ] `get_today_tasks` retorna tareas con `dueDate` = hoy, ordenadas por prioridad
- [ ] `get_overdue_tasks` retorna tareas con `dueDate` < hoy y status != completed
- [ ] `get_inbox_pending` retorna items con `status: 'pending'`, más recientes primero
- [ ] `get_habit_status` acepta parámetro `date` (YYYY-MM-DD) y retorna 14 hábitos con su estado
- [ ] `get_active_projects` retorna proyectos `in-progress` con conteo de tareas completadas/total
- [ ] "Hoy" se calcula en `America/Bogota`, no en UTC: una tarea con `dueDate` hoy a las 8 PM hora Colombia aparece en `get_today_tasks` y no en mañana

**Archivos a crear:**

- `mcp-server/src/tools/daily-summary.ts` — Agregación de todas las entidades
- `mcp-server/src/tools/tasks.ts` — `get_today_tasks` + `get_overdue_tasks`
- `mcp-server/src/tools/inbox.ts` — `get_inbox_pending`
- `mcp-server/src/tools/habits.ts` — `get_habit_status`
- `mcp-server/src/tools/projects.ts` — `get_active_projects`
- `mcp-server/src/lib/firestore-queries.ts` — Queries compartidas (helper para paths `users/{uid}/...`)

**Notas de implementación:**

- Todas las queries usan el path `users/{SEBASTIAN_UID}/collection`. El UID se lee de la variable de entorno.
- `get_daily_summary` es el tool más importante — combina datos de 4 colecciones en un solo response.
- Los hábitos usan IDs determinísticos `YYYY-MM-DD` dentro de cada habit doc. Los 14 hábitos están hardcodeados (ver doc arquitectura). El tool necesita saber los nombres para formatear la respuesta.
- `dueDate` en Firestore es un `number` (UNIX ms). Comparar con inicio de hoy e inicio de mañana **calculados en `America/Bogota`** vía `lib/time.ts`.
- Los responses deben ser **texto legible**, no JSON crudo. Ejemplo: `"📋 Tareas de hoy (3):\n• [urgent] Revisar PR #42\n• [high] Escribir tests\n• [medium] Llamar al banco"`.

---

### F3: Read Tools — Conocimiento

**Qué:** 4 tools de lectura enfocados en notas y el sistema de conocimiento.

**Criterio de done:**

- [ ] `get_fsrs_due_notes` retorna notas con `fsrsDue` ≤ ahora, con título y resumen
- [ ] `get_recent_notes` acepta parámetros opcionales `limit`, `area`, `tag` y retorna notas recientes
- [ ] `search_notes` acepta `query` (string) y busca en título, contentPlain y aiTags
- [ ] `get_objectives_progress` retorna objetivos con sus proyectos vinculados y % de avance

**Archivos a crear:**

- `mcp-server/src/tools/notes.ts` — `get_fsrs_due_notes` + `get_recent_notes` + `search_notes`
- `mcp-server/src/tools/objectives.ts` — `get_objectives_progress`

**Notas de implementación:**

- `search_notes` en server-side NO puede usar Orama (es client-side). Para <500 notas, fetch all + `.filter()` con `.includes()` en memoria. Simple, suficiente para escala personal. Ver D5.
- `get_objectives_progress` hace join: para cada objetivo, contar tareas de sus proyectos vinculados.
- Los responses de notas incluyen: título, resumen AI (si existe), tags, fecha. NO incluir el content completo — es demasiado largo.

---

### F4: Write Tools

**Qué:** 5 tools de escritura que permiten crear y modificar entidades en SecondMind.

**Criterio de done:**

- [ ] `create_task` crea una tarea con name, priority, dueDate (opcional), projectId (opcional), areaId (opcional)
- [ ] `complete_task` marca una tarea como `completed` con `completedAt` = now
- [ ] `create_note` crea una nota con title, contentPlain, tags (opcional), areaIds (opcional), noteType (default: 'fleeting')
- [ ] `create_inbox_item` crea un item en inbox con rawContent y source = 'mcp-server'
- [ ] `toggle_habit` marca/desmarca un hábito para una fecha dada
- [ ] Todas las escrituras generan `createdAt`/`updatedAt` con `Date.now()`
- [ ] Las escrituras disparan las Cloud Functions existentes (`processInboxItem` para inbox, `autoTagNote` para notas)
- [ ] Una entidad creada vía MCP aparece en la app (web, desktop y Android) tras el sync normal

**Archivos a crear:**

- `mcp-server/src/tools/create-task.ts`
- `mcp-server/src/tools/complete-task.ts`
- `mcp-server/src/tools/create-note.ts`
- `mcp-server/src/tools/create-inbox-item.ts`
- `mcp-server/src/tools/toggle-habit.ts`

**Notas de implementación:**

- Las escrituras usan `admin.firestore().doc(path).set(data)` / `.update(data)`. No hay TinyBase server-side.
- Al crear inbox items, `processInboxItem` (trigger `onDocumentCreated`) se dispara automáticamente.
- Al crear notas, `autoTagNote` (trigger `onDocumentWritten`) se dispara si `aiProcessed === false`.
- `create_note` genera `id` con `crypto.randomUUID()`. Escribe `contentPlain` como content (sin TipTap JSON — notas vía MCP son plain text).
- `toggle_habit`: los hábitos tienen IDs fijos (0-13). Verificar el schema exacto de cómo se almacenan los checks antes de implementar.
- Cada tool de escritura retorna confirmación con el ID: `"✅ Tarea creada: 'Revisar PR #42' (id: abc123)"`.
- Las escrituras desde el server no pasan por el persister de TinyBase: verificar contra `Spec/gotchas/` del dominio sync que la app recibe y reconcilia bien documentos escritos externamente (campos completos, tipos, `updatedAt`).

---

### F5: Deploy a Cloud Run + Validación con cliente MCP

**Qué:** Containerizar el MCP server, deployarlo a Cloud Run en el proyecto GCP `secondmindv1` y validarlo end-to-end con MCP Inspector (cliente neutral, no Jarvis).

**Criterio de done:**

- [ ] `docker build` genera imagen funcional
- [ ] `gcloud run deploy` despliega exitosamente en Cloud Run
- [ ] El endpoint HTTPS responde al handshake MCP desde internet
- [ ] Bearer token validado desde Secret Manager
- [ ] Firebase Admin SDK se autentica con Application Default Credentials (mismo proyecto GCP)
- [ ] MCP Inspector, apuntando a la URL de Cloud Run con el Bearer token, lista los 15 tools + `ping`
- [ ] Desde MCP Inspector: `get_daily_summary` retorna datos reales y `create_task` crea una tarea visible en la app
- [ ] Contrato para consumidores documentado (ver sección "Contrato para clientes MCP")
- [ ] Las Cloud Functions existentes siguen funcionando

**Archivos a crear/modificar:**

- `mcp-server/Dockerfile` — Multi-stage build (build TS → run Node)
- `mcp-server/.dockerignore`
- `mcp-server/deploy.sh` — Script con `gcloud run deploy` + flags
- `mcp-server/README.md` — Setup local, deploy, rotación del token y contrato para clientes

**Notas de implementación:**

- Cloud Run region: `us-central1` (misma que las Cloud Functions).
- El service account del proyecto ya tiene acceso a Firestore. No necesita JSON explícito.
- Secrets: `MCP_BEARER_TOKEN` en Secret Manager, montado como env var en Cloud Run.
- Min instances: 0 (escala a cero). Max: 1 (un solo usuario).
- Memory: 256MB. CPU: 1 vCPU. Timeout: 60s.
- El repo de SecondMind es público: el token, la URL con el token y el UID nunca se commitean. `.env.example` solo lleva nombres de variables.

---

## Contrato para clientes MCP

Lo único que un cliente (Jarvis u otro) necesita saber. Vive en `mcp-server/README.md`; los clientes lo consumen desde su propio repo.

| Campo         | Valor                                                                 |
| ------------- | --------------------------------------------------------------------- |
| URL           | `https://<servicio-cloud-run>/mcp`                                    |
| Transport     | Streamable HTTP (un solo endpoint `POST /mcp`)                        |
| Auth          | Header `Authorization: Bearer <MCP_BEARER_TOKEN>`                     |
| Tools         | 10 read + 5 write + `ping` (nombres y parámetros en F2–F4)            |
| Formato       | Respuestas en texto legible en español, no JSON                       |
| Zona horaria  | "Hoy" = día calendario en `America/Bogota`                            |
| Garantías     | Sin estado entre requests; escrituras visibles en la app tras el sync |

---

## Orden de implementación

1. **F1 (Scaffold)** → Base del proyecto MCP, sin esto no hay nada
2. **F2 (Read: estado del día)** → Tools más usados, se prueban localmente con MCP Inspector
3. **F3 (Read: conocimiento)** → Complementa F2, misma estructura
4. **F4 (Write)** → Se verifica que escrituras se reflejan en reads y en la app
5. **F5 (Deploy + validación)** → Empaqueta, sube a Cloud Run, valida con MCP Inspector y documenta el contrato

La conexión de Jarvis a este server es una fase del proyecto `jarvis`, posterior a F5.

---

## Estructura de archivos

```
mcp-server/                          # Proyecto independiente dentro del repo SecondMind
├── package.json
├── tsconfig.json
├── Dockerfile
├── .dockerignore
├── .env.example
├── deploy.sh
├── README.md                        # Setup, deploy, rotación de token, contrato para clientes
├── src/
│   ├── index.ts                     # Entry: McpServer + HTTP transport + auth
│   ├── auth.ts                      # Bearer token validation
│   ├── firebase.ts                  # admin.initializeApp() + Firestore ref
│   ├── lib/
│   │   ├── firestore-queries.ts     # Helpers: userDoc, userCollection
│   │   └── time.ts                  # startOfDay/endOfDay en America/Bogota
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
│       └── toggle-habit.ts
```

Esta fase no toca `src/` de la app.

---

## Definiciones técnicas

### D1: ¿Por qué Cloud Run y no Cloud Functions HTTP?

Cloud Functions HTTP limita a 60s y no da control sobre el container. Cloud Run está en el mismo proyecto GCP, usa el mismo service account y escala a cero. Free tier: 2M requests/mes — más que suficiente para uso personal.

### D2: ¿Por qué Bearer token estático y no OAuth?

Un solo usuario. El token se genera una vez (`openssl rand -hex 32`) y se almacena en Secret Manager. Cada cliente lo envía como header en cada request MCP. Dos casos reabren esta decisión, cada uno como fase propia: (a) conectar clientes que exigen OAuth (por ejemplo, conectores de claude.ai), o (b) exponer el MCP a usuarios de la beta, que requiere auth por usuario y deja de usar un UID fijo.

### D3: ¿Por qué proyecto separado del app principal?

Las Cloud Functions existentes son triggers de Firestore, no HTTP endpoints. El MCP server es un proceso HTTP con su propio lifecycle. Deploy independiente: `cd mcp-server && gcloud run deploy`.

### D4: ¿Por qué el MCP es agnóstico del cliente?

El MCP es una capacidad de SecondMind, no una pieza de Jarvis. Si el server conociera a su cliente (nombres de tools pensados para un agente, respuestas formateadas para voz, lógica de briefings), cualquier cambio en Jarvis obligaría a tocar SecondMind y viceversa. Con un contrato neutral (sección "Contrato para clientes MCP"), Jarvis puede cambiar de agente o de modelo y SecondMind puede sumar clientes sin coordinación. El formato para voz, la personalidad y los schedules son responsabilidad del cliente.

### D5: ¿Búsqueda de notas — por qué filtro en memoria?

Firestore no tiene FTS nativo. Para <500 notas, fetch all + `.filter()` con `.includes()` es instantáneo. Si escala a >1000 notas, evaluar Orama server-side o extensión de Firestore.

### D6: ¿Por qué salieron `save_briefing` y el BriefingCard?

La Rev. 1 los diseñó para guardar en SecondMind los briefings de 12 skills programadas. Esas skills ya no existen en ningún plan concreto: en Jarvis quedaron como iteración futura "solo con evidencia de necesidad", y el cliente ya entrega los mensajes por su propio canal (Telegram). Construir un store, un card y un tool para un productor que no existe es acumular sin evidencia (P10, YAGNI). Si Jarvis llega a tener briefings programados y se demuestra que hace falta verlos dentro de SecondMind, entra como feature propia con su SPEC. El diseño de la Rev. 1 (schema `Briefing`, 12 tipos, iconos) queda en el historial de git como referencia.

### D7: ¿Por qué no Push Notifications (FCM)?

Las notificaciones son responsabilidad del cliente, que ya tiene su canal (Telegram en el caso de Jarvis). Agregar FCM en SecondMind duplicaría el canal sin valor adicional. Si en el futuro se quieren notificaciones nativas del OS independientes de cualquier cliente, se agrega FCM como fase separada.

---

## Checklist de completado

Al terminar esta fase, TODAS estas condiciones deben ser verdaderas:

- [ ] `mcp-server/` existe como proyecto independiente con su propio `package.json`
- [ ] `npm run build` compila sin errores TypeScript
- [ ] El MCP server corre localmente y responde al handshake MCP
- [ ] Los 15 tools (10 read + 5 write) funcionan contra Firestore de producción
- [ ] "Hoy" se calcula en `America/Bogota` en todos los tools que dependen de la fecha
- [ ] El server está deployado en Cloud Run con HTTPS
- [ ] Bearer token autenticado correctamente; token inválido retorna 401
- [ ] MCP Inspector contra Cloud Run: lista tools, `get_daily_summary` retorna datos reales y `create_task` crea una tarea visible en la app
- [ ] Contrato para clientes MCP documentado en `mcp-server/README.md`
- [ ] Ningún secreto, URL con token ni UID commiteado en el repo
- [ ] Las Cloud Functions existentes siguen funcionando sin interferencia
- [ ] El deploy del MCP server no afecta Firebase Hosting ni Cloud Functions

---

## Gotchas anticipados

1. **Auth de clientes remotos** — Cada cliente MCP pasa headers de auth de forma distinta. El server solo garantiza `Authorization: Bearer`; cómo lo configura cada cliente se documenta en el repo del cliente.
2. **Streamable HTTP vs SSE** — Usar Streamable HTTP. Algunos clientes viejos solo hablan SSE; si un cliente no conecta, verificar su soporte antes de tocar el server.
3. **Zona horaria en Cloud Run** — Cloud Run corre en UTC. Si "hoy" se calcula con `new Date()` sin zona, entre las 7 PM y la medianoche de Colombia las tareas de hoy se cuentan como de mañana. Todo cálculo de día pasa por `lib/time.ts` con `America/Bogota`.
4. **Firebase Admin en Cloud Run** — No necesita service account JSON si corre en el mismo proyecto GCP. Usa Application Default Credentials automáticamente.
5. **Habits schema** — Verificar exactamente cómo se almacenan los checks de hábitos en Firestore antes de implementar `toggle_habit` y `get_habit_status`.
6. **Notas creadas vía MCP no tienen TipTap JSON** — Solo `contentPlain`. Si se abre en el editor, TipTap debería manejar plain text gracefully. Verificar.
7. **Escrituras externas vs TinyBase** — Los documentos escritos por Admin SDK llegan a la app por el persister custom de Firestore. Un campo faltante o con tipo distinto al que espera el store puede romper la hidratación. Validar cada write tool contra el schema que usan los repos de `src/infra/repos/`.
8. **Cold start de Cloud Run** — Con min instances = 0, el primer request después de inactividad puede tardar 3-5s (arranque del container). Para uso interactivo por voz o chat, esto puede sentirse lento. Si molesta, subir min instances a 1 (costo ~$0 si está idle con CPU allocation = request-only).
9. **Repo público** — El código del MCP es público. Que el código sea visible no es problema; el token y el UID sí. Revisar el diff de cada PR de esta fase buscando secretos antes de mergear.

---

## Siguiente fase

Con Fase 6 completada, SecondMind deja de ser solo una app que Sebastian abre: se vuelve una fuente de datos a la que cualquier agente autorizado puede leer y escribir. El primer uso es Jarvis, cuya fase de integración (registrar este MCP en Hermes, sumar SecondMind como fuente de verdad en su personalidad, probar "¿cómo va mi día?" por voz y por Telegram) se especifica y ejecuta en el repo `jarvis`.

Iteraciones posteriores del lado de SecondMind, solo con evidencia de necesidad:

- **Tools avanzados** — `move_task_to_tomorrow`, `link_notes`, `get_note_content(id)`, `reschedule_task`
- **Briefings dentro de SecondMind** — `save_briefing` + BriefingCard, solo si un cliente genera briefings programados y se demuestra que hace falta verlos en la app (ver D6)
- **OAuth / multi-usuario** — si se quiere conectar clientes que lo exigen o abrir el MCP a la beta (ver D2)
- **API triggers** — Conectar alertas externas (GitHub, Sentry) que crean inbox items vía MCP
