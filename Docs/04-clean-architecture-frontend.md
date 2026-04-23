# Clean Architecture en Frontend

> Guía práctica de las 4 capas y sus responsabilidades. Aplicable a cualquier proyecto React/Vue/Angular/Solid con backend. Ejemplo vivo: SecondMind.

---

## La idea central

Clean Architecture organiza el código en **círculos concéntricos**. Cada círculo es una capa con responsabilidad distinta, y la regla que las une es una sola:

> **Las dependencias apuntan SIEMPRE hacia adentro.**
>
> Una capa conoce a las capas internas. NUNCA conoce a las externas.

Esto significa que podés **reemplazar una capa externa sin tocar las internas**. Cambiar Firebase por Supabase, REST por GraphQL, Redux por TinyBase, React por Solid — si la arquitectura está bien, el núcleo no se entera.

```
                ┌─────────────────────────┐
                │  Servicios externos     │   ← Firebase, HTTP, localStorage
                │  ┌───────────────────┐  │
                │  │  Adaptadores      │  │   ← repos, interceptors
                │  │  ┌─────────────┐  │  │
                │  │  │ Componentes │  │  │   ← UI, hooks, pages
                │  │  │  ┌───────┐  │  │  │
                │  │  │  │Modelos│  │  │  │   ← types, state
                │  │  │  └───────┘  │  │  │
                │  │  └─────────────┘  │  │
                │  └───────────────────┘  │
                └─────────────────────────┘
```

---

## Las 4 capas

### Capa 1: Modelos + State (el núcleo)

**Qué es:** la definición del **dominio** de tu aplicación. Las entidades que existen y cómo se guardan en memoria durante la vida del app.

**Qué contiene:**

- Interfaces/tipos TypeScript de las entidades (`Note`, `Task`, `User`, `Project`)
- Enums y union types del dominio (`TaskStatus = 'todo' | 'doing' | 'done'`)
- El state manager (Redux, Zustand, TinyBase, Context) con las entidades cargadas
- Funciones puras de dominio que operan sobre modelos sin efectos secundarios

**Qué NO contiene:**

- Nada de React (componentes, hooks que llamen APIs de browser)
- Nada de Firebase, axios, fetch
- Nada de localStorage, sessionStorage, cookies
- Nada de routing, navegación
- Nada de styling

**Cuándo se modifica:**

- Agregar una entidad nueva
- Agregar/remover un campo de una entidad existente
- Cambiar reglas de dominio (ej: "una tarea puede estar en múltiples proyectos")

**Dependencias permitidas:** ninguna hacia afuera. Solo otras capas 1 (un modelo puede referenciar otro modelo).

**Ejemplo SecondMind:**

- `src/types/note.ts` — interface `Note`
- `src/types/task.ts` — interface `Task`
- `src/stores/notesStore.ts` — TinyBase store con las notas en memoria

**Regla mental:** si tocás esta capa, **todas las capas de afuera se enteran**. Es el contrato fundamental. Tocala con cuidado.

---

### Capa 2: Componentes (casos de uso)

**Qué es:** la UI que el usuario ve y la **orquestación de lógica de negocio** que opera sobre los modelos. En términos de Clean Arch tradicional, son los "use cases" traducidos al paradigma React.

**Qué contiene:**

- Componentes de UI (páginas, features, widgets)
- Hooks personalizados que orquestan llamadas a adaptadores
- Context providers de React
- Routing y layouts
- Formularios, validación de UI, manejo de errores visuales

**Qué NO contiene:**

- Llamadas directas a Firebase, axios, fetch
- Lógica de serialización de requests HTTP
- Configuración de clientes (Firebase app, axios instance)

**Cuándo se modifica:**

- Cambiar cómo luce algo
- Cambiar flujos de usuario
- Agregar una pantalla
- Cambiar la lógica de "cuándo" o "en qué orden" se ejecutan cosas

**Dependencias permitidas:** capa 1 (modelos/state) y capa 3 (adaptadores). **NUNCA** directo a la capa 4.

**Ejemplo SecondMind:**

- `src/components/tasks/TaskCard.tsx` — UI de una tarea
- `src/hooks/useTasks.ts` — hook que lee TinyBase + delega writes al repo
- `src/app/notes/page.tsx` — página del listado de notas

**Regla mental:** pregúntate "¿qué está haciendo el usuario acá?" — la respuesta vive en esta capa. Esta capa NO responde "cómo se guarda en el servidor" — eso es capa 3.

---

### Capa 3: Adaptadores

**Qué es:** el **traductor** entre el mundo externo (HTTP, Firebase, APIs) y los componentes. Normaliza shapes, uniformiza errores, aplica patrones comunes (optimistic updates, retry, cache).

**Qué contiene:**

- **Adapters:** funciones que transforman respuestas del backend al shape que los componentes esperan (ej: `snake_case` → `camelCase`, `null` → `undefined`, parseo de fechas)
- **Interceptors:** lógica que envuelve todas las requests/responses (inyectar auth tokens, manejar 401 refrescando token, capturar 500s para logging global)
- **Repositorios (repos):** abstracción de operaciones CRUD por entidad, encapsulando el patrón de acceso (optimistic update, batching, cache)

**Qué NO contiene:**

- UI (ni React, ni HTML)
- Lógica de negocio compleja (eso pertenece a componentes/hooks)
- Configuración del cliente HTTP/Firebase (eso es capa 4)

**Cuándo se modifica:**

- El backend cambia un shape de respuesta
- Se agrega un nuevo endpoint/colección
- Se cambia una regla global (ej: "todas las requests ahora llevan header X")
- Se introduce un patrón nuevo (ej: "todos los writes son optimistas")

**Dependencias permitidas:** capa 1 (modelos) y capa 4 (servicios externos). NUNCA capa 2.

**Ejemplo SecondMind:**

- `src/infra/repos/baseRepo.ts` — factory `createFirestoreRepo` que implementa optimistic update
- `src/infra/repos/tasksRepo.ts` — repo específico de tareas construido con el factory
- `src/infra/repos/notesRepo.ts` — repo con método especial `saveContent` que atomiza el write del TipTap JSON

**Señal de que la capa funciona bien:** cuando el backend cambia y los componentes **no se enteran**, es porque el adaptador hizo su trabajo.

**Tip clave:** esta es la capa más incomprendida. Mucha gente salta de componentes a servicios directamente, y pierde el beneficio entero de la arquitectura. Si tu componente importa `firebase/firestore` o `axios` directamente, **te falta un adaptador**.

---

### Capa 4: Servicios externos

**Qué es:** las **llamadas reales** al mundo. El cliente Firebase, axios configurado, funciones que hablan con localStorage, la API de geolocalización del navegador, etc.

**Qué contiene:**

- Inicialización de clientes (`initializeApp` de Firebase, `axios.create`)
- Configuración de endpoints, headers default, timeout
- Wrappers thin sobre APIs del browser (localStorage, IndexedDB, Service Workers)
- Clientes de SDKs de terceros (Stripe, Intercom, Sentry)

**Qué NO contiene:**

- Lógica de negocio
- Normalización de datos (eso es capa 3)
- Manejo de errores específico del dominio

**Cuándo se modifica:**

- Cambiar de proveedor (Firebase → Supabase)
- Cambiar configuración (base URL, timeout, auth strategy)
- Agregar un servicio externo nuevo

**Dependencias permitidas:** solo librerías externas y config. NUNCA a otras capas del proyecto.

**Ejemplo SecondMind:**

- `src/lib/firebase.ts` — `initializeApp`, export de `db` y `auth`
- `src/lib/orama.ts` — inicialización del índice de búsqueda
- `src/lib/embeddings.ts` — wrapper sobre el cache de embeddings desde Firestore

**Regla mental:** si borrás esta capa completa y la reemplazás por otra implementación (ej: mocks para tests, o otro proveedor), el resto del sistema debería compilar con cambios mínimos.

---

## El flujo típico de una operación

Ejemplo: "el usuario marca una tarea como completada".

```
┌──────────────────────────────────────────────────────────────┐
│ 1. COMPONENTE (TaskCard.tsx)                                 │
│    onClick → llama a completeTask(taskId) del hook useTasks  │
└────────────────────┬─────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. COMPONENTE / HOOK (useTasks.ts)                           │
│    completeTask(id) → delega a tasksRepo.completeTask(id)    │
└────────────────────┬─────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. ADAPTADOR (tasksRepo, construido con createFirestoreRepo) │
│    completeTask(id) →                                        │
│      a) lee row actual desde tasksStore                      │
│      b) computeNextTaskStatus(status)  (fn pura)             │
│      c) repo.update(id, partial):                            │
│         - store.setPartialRow (sync, optimistic)             │
│         - await setDoc(...) (async, persistencia)            │
└────────────────────┬─────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. SERVICIO EXTERNO (lib/firebase.ts)                        │
│    setDoc de firebase/firestore ejecuta la request real      │
└──────────────────────────────────────────────────────────────┘
```

**La magia:** cada capa solo sabe de la siguiente. El componente NO sabe qué pasa en Firebase. El repo NO sabe qué UI disparó el update. Si mañana reemplazás Firebase por Supabase, solo tocás capas 3 y 4.

---

## Cómo decidir dónde va algo

Cuando estás por escribir código nuevo y no sabés en qué carpeta ponerlo, usá estas 4 preguntas **en orden**:

**1. "¿Esto define qué ES una entidad del dominio?"**
Sí → capa 1 (models/state). Ej: interface `Note`, reducer `notesSlice`.
No → seguí.

**2. "¿Esto habla directamente con el backend o una API externa?"**
Sí, y encima normaliza/traduce la respuesta → capa 3 (adapters/repos).
Sí, pero solo es configuración/inicialización → capa 4 (services).
No → seguí.

**3. "¿Esto es UI visible o lógica que orquesta la UI?"**
Sí → capa 2 (components/hooks).

**4. "Aún no me queda claro"**
Preguntá: **"si cambiara el framework de UI, este código sobreviviría?"**

- Sí → es capa 1 (modelo puro) o capa 3-4 (independiente de la vista)
- No → es capa 2 (componente)

Otra pregunta útil: **"si cambiara el backend, este código sobreviviría?"**

- Sí → es capa 1 o capa 2 (si consume vía adaptador)
- No → es capa 3 (adaptador — el que absorbió el cambio) o capa 4 (servicio específico del proveedor viejo, que hay que reescribir)

---

## Señales de violación de la arquitectura

Estas son red flags que te avisan que rompiste la regla de dependencias:

### Red flags críticas

| Síntoma                                                           | Qué violó                                      | Cómo arreglarlo                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| Un componente importa `firebase/firestore` directo                | Capa 2 → 4 saltándose 3                        | Crear un repo/adapter en capa 3 y que el componente lo consuma              |
| Un tipo en `types/` importa `React.ReactNode`                     | Capa 1 acoplada a framework UI                 | Mover el tipo a `components/` o reescribir sin tipos de React               |
| Un archivo en `lib/firebase.ts` importa un componente             | Capa 4 → 2, flecha invertida                   | Invertir: mover la lógica compartida a capa 3                               |
| Tests de un hook requieren mockear Firebase completo              | El hook probablemente llama directo a Firebase | Introducir repo en el medio, mockear el repo                                |
| Cambiar el shape de una response del backend rompe 10 componentes | Falta adaptador absorbiendo el cambio          | Crear adapter en capa 3, componentes siguen usando el shape interno estable |

### Red flags suaves (no críticas pero indican drift)

- Un hook tiene `try/catch` con lógica específica de Firebase → debería estar en el repo
- Un componente pasa un `Timestamp` de Firestore directo a `formatDate` → el repo debería convertirlo a `Date` o string ISO
- Una función en `utils/` tiene 3 if/else dependiendo del provider activo → split en implementaciones por provider

---

## Modularización por feature vs por tipo

Hay un segundo eje ortogonal a las capas: **cómo organizás los archivos dentro de cada capa**.

**Por tipo (clásico):**

```
src/
  components/       ← toda la UI junta
  hooks/            ← todos los hooks juntos
  services/         ← todos los servicios juntos
  adapters/         ← todos los adaptadores juntos
```

**Por feature (moderno):**

```
src/
  features/
    notes/          ← UI + hooks + adapters específicos de notas
    tasks/          ← UI + hooks + adapters específicos de tareas
  shared/
    components/ui/  ← componentes visuales genéricos (Button, Input)
    lib/            ← servicios externos (configuración global)
```

**Híbrido (SecondMind y la mayoría de apps modernas):**

```
src/
  components/
    ui/             ← shadcn, compartido
    tasks/          ← UI específica de tareas
    notes/          ← UI específica de notas
  hooks/            ← todos los hooks (chico o medio)
  infra/repos/      ← todos los adaptadores
  stores/           ← todos los modelos/state
  lib/              ← servicios externos
  types/            ← todos los modelos
```

**Regla pragmática:** empezá por tipo. Cuando una feature crezca a 5+ archivos propios y tenga poca interacción con otras, extraela a su carpeta. No reorganices preventivamente.

---

## Mapping completo SecondMind

Referencia concreta para ver cómo se traduce la teoría:

| Capa | Clean Arch nombre  | SecondMind ubicación          | Ejemplos                                    |
| ---- | ------------------ | ----------------------------- | ------------------------------------------- |
| 1    | Models             | `src/types/`                  | `note.ts`, `task.ts`, `habit.ts`            |
| 1    | State              | `src/stores/`                 | `notesStore.ts`, `tasksStore.ts` (TinyBase) |
| 2    | Use cases (UI)     | `src/components/`             | `TaskCard.tsx`, `NoteEditor.tsx`            |
| 2    | Use cases (lógica) | `src/hooks/`                  | `useTasks.ts`, `useHybridSearch.ts`         |
| 2    | Routing            | `src/app/`                    | `layout.tsx`, `notes/page.tsx`              |
| 3    | Adapters/Repos     | `src/infra/repos/`            | `baseRepo.ts` (factory), `tasksRepo.ts`     |
| 3    | Interceptors       | _(implícito en Firebase SDK)_ | Auth tokens automáticos                     |
| 4    | Services           | `src/lib/`                    | `firebase.ts`, `orama.ts`, `embeddings.ts`  |

**Detalles únicos de SecondMind:**

- **No hay carpeta `adapters/` para normalizar shapes** porque Firestore devuelve shapes que el propio proyecto define (no hay backend heterogéneo). El repo layer cumple el rol de adaptador absorbiendo el patrón optimistic update.
- **No hay carpeta `interceptors/`** porque el Firebase SDK maneja auth tokens automáticamente.
- **`src/lib/` mezcla servicios externos y utilities** (`formatDate.ts`, `utils.ts`). En proyectos más grandes conviene separar `lib/services/` y `lib/utils/`.
- **Cloud Functions viven en `src/functions/`** — son un deploy separado. Cada CF es lineal (trigger Firestore → SDK call a Claude/OpenAI → `admin.firestore()` write → error handling). Clean Arch de 4 capas no aplica: intentar replicarla sería sobre-ingeniería para código event-driven corto. Regla operativa: si una CF crece >200 líneas, extraer helpers a `src/functions/src/lib/`, pero sin replicar el layering del frontend.

---

## Cuándo NO aplicar esta arquitectura

Clean Arch tiene **costo real**: más archivos, más indirección, más ceremonia. No siempre vale la pena.

**Saltala si:**

- **Prototipo throwaway:** vas a tirar el código en semanas, no escala. Escribí directo, importá Firebase en el componente, andá rápido.
- **App estática sin backend:** landing page, portfolio, docs site. Solo tenés capas 1 y 2 (y ni siquiera 1 si no hay state).
- **App de <3 pantallas sin estado compartido:** la indirección no paga. Todo cabe en componentes + un par de helpers.
- **Equipo de 1 con zero intención de migrar nada:** si sabés que Firebase es para siempre, el adapter layer es ceremony.

**Aplicala cuando:**

- El proyecto va a vivir >6 meses
- Hay posibilidad real de cambiar proveedores (backend, state, UI lib)
- Hay >1 desarrollador
- Querés tests unitarios sin montar el framework UI entero
- Hay features complejas con lógica de negocio reutilizable
- La escala va a crecer (más entidades, más pantallas)

**Aplicala parcialmente cuando:**

- App mediana: aplicá capas 1, 2, 4 claramente; capa 3 solo donde hay complejidad (repos por entidad con patrones repetidos). SecondMind hizo exactamente esto — el repo layer apareció en F10, cuando ya había evidencia de que el patrón optimistic update se repetía en 6 hooks.

---

## Checklist para proyecto nuevo

Si querés arrancar un proyecto React nuevo con esta arquitectura lista desde el día 1:

**Setup inicial:**

```
src/
  types/              ← capa 1: interfaces del dominio
  stores/             ← capa 1: state (Zustand/Redux/TinyBase)
  components/
    ui/               ← capa 2: genéricos (shadcn o propio)
    [feature]/        ← capa 2: UI por feature
  hooks/              ← capa 2: orquestación
  app/                ← capa 2: routing
  infra/
    repos/            ← capa 3: adaptadores por entidad
    interceptors/     ← capa 3: solo si tenés HTTP custom (no Firebase)
  lib/                ← capa 4: servicios externos + utils
```

**Reglas a setear desde el principio:**

1. **ESLint rule "no-restricted-imports"** que prohíba importar desde capa 4 en componentes. Ejemplo: bloquear `firebase/firestore` desde `src/components/**` y `src/hooks/**`.
2. **Convención de naming consistente:** `use[Entidad][Acción]` para hooks, `[entidad]Repo` para repos, `[Entidad]` para modelos.
3. **Tests unitarios del repo layer desde el primer repo** — valida que el patrón optimistic update funciona antes de multiplicarlo.
4. **Un repo por entidad, no un repo gigante** — el factory genérico reutiliza el 80%, el repo específico solo agrega métodos únicos.

**Primeros pasos concretos:**

1. Definí la primera entidad en `types/` (interface)
2. Creá el store (`stores/[entidad]Store.ts`) con la shape definida
3. Creá el factory genérico en `infra/repos/baseRepo.ts`
4. Creá el primer repo específico en `infra/repos/[entidad]Repo.ts`
5. Escribí el hook en `hooks/use[Entidad].ts` que consume el store + delega al repo
6. Construí la UI en `components/[entidad]/` consumiendo el hook
7. Escribí los tests del repo antes de agregar el segundo repo

---

## Referencias y lecturas complementarias

- **Clean Architecture** (libro) — Robert C. Martin. El original, backend-centric.
- **The Clean Architecture** — https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- **Hexagonal Architecture (Ports & Adapters)** — Alistair Cockburn. Hermana conceptual.
- **Este proyecto (SecondMind):** `Spec/features/SPEC-feature-10-repos-layer.md` documenta la introducción del adapter layer con el debate real de trade-offs.

---

## Resumen de una sola página

1. **Cuatro capas concéntricas:** modelos (centro) → componentes → adaptadores → servicios (afuera).
2. **Dependencias apuntan hacia adentro, siempre.** Nunca al revés.
3. **Modelos:** qué ES una entidad. No conocen nada externo.
4. **Componentes:** UI + orquestación. Consumen adaptadores, nunca servicios directos.
5. **Adaptadores:** traducen el mundo externo al interno. Absorben cambios de backend.
6. **Servicios:** llamadas reales al mundo. Configuración, clientes, APIs del browser.
7. **Regla de oro operativa:** si cambia el backend, solo toco capa 3-4. Si cambia la UI, solo toco capa 2. Si cambia el dominio, toco todo (pero de forma controlada).
8. **Aplicala cuando el proyecto vive >6 meses y puede migrar algo.** Saltala en prototipos.
