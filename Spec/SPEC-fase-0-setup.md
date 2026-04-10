# SPEC — SecondMind · Fase 0: Setup

> Alcance: Proyecto configurado, compilando, deployado, con auth y data layer funcionando end-to-end
> Dependencias: Ninguna (fase inicial)
> Estimado: 1 semana
> Stack relevante: Vite + React 19 + TypeScript strict + Tailwind CSS + shadcn/ui + TinyBase + Firebase (Auth + Firestore + Hosting)

---

## Objetivo

Al terminar esta fase, el proyecto tiene la infraestructura completa lista para construir features. Un usuario puede hacer sign-in con Google, ver una página vacía con sidebar, y los datos persisten en Firestore. El deploy a Firebase Hosting funciona. No hay funcionalidad para el usuario final — esto es cimientos.

---

## Features

### F1: Proyecto Vite + React 19 + TypeScript + Tailwind

**Qué:** Scaffold del proyecto con todas las herramientas de desarrollo configuradas y linting funcionando.

**Criterio de done:**
- [ ] `npm run dev` levanta la app sin errores ni warnings de TypeScript
- [ ] `npm run build` genera bundle de producción sin errores
- [ ] `npm run lint` corre ESLint sin errores
- [ ] Path alias `@/` resuelve a `src/` en imports
- [ ] Tailwind CSS aplica estilos correctamente (verificar con un `<div className="bg-primary text-white p-4">Test</div>`)

**Archivos a crear:**
- `vite.config.ts` — Config Vite con path alias `@/` → `src/`
- `tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, path alias
- `tsconfig.app.json` — Config específica de la app (extends base)
- `tailwind.config.ts` — Config Tailwind con tokens de shadcn/ui
- `postcss.config.js` — PostCSS con Tailwind y autoprefixer
- `.eslintrc.cjs` — `@typescript-eslint/recommended` + import order plugin
- `.prettierrc` — Single quotes, trailing commas, 100 char width
- `src/main.tsx` — Entry point de React
- `src/index.css` — Tailwind directives + variables CSS de shadcn/ui

**Notas de implementación:**
- Usar `npm create vite@latest -- --template react-ts` como base
- Instalar shadcn/ui con `npx shadcn@latest init` después del scaffold — esto configura Tailwind automáticamente con los CSS variables correctos
- TypeScript strict es obligatorio desde el inicio. No configurar lax y "migrar después"

---

### F2: Estructura de carpetas base

**Qué:** Crear toda la estructura de directorios del proyecto con archivos placeholder donde corresponda.

**Criterio de done:**
- [ ] La estructura de carpetas coincide con la definida en `03-convenciones-y-patrones.md` sección 1
- [ ] Cada carpeta tiene al menos un archivo (evita que Git ignore carpetas vacías)
- [ ] Los imports con `@/` funcionan desde cualquier nivel de profundidad

**Archivos a crear:**
- `src/app/layout.tsx` — Layout raíz con placeholder (sidebar + content area)
- `src/app/page.tsx` — Dashboard placeholder ("SecondMind — Fase 0")
- `src/components/layout/Sidebar.tsx` — Sidebar con navegación placeholder (items sin funcionalidad)
- `src/stores/.gitkeep` — Placeholder para TinyBase stores
- `src/hooks/.gitkeep` — Placeholder para custom hooks
- `src/lib/.gitkeep` — Placeholder para utilidades
- `src/types/common.ts` — Types compartidos: `ParaType`, `NoteType`, `Priority`, `TaskStatus`, `ProjectStatus`

**Notas de implementación:**
- El Sidebar debe renderizar los 7 items de navegación (Dashboard, Inbox, Notas, Tareas, Proyectos, Objetivos, Hábitos) con iconos de `lucide-react`, pero sin routing aún — solo visual
- Los tipos en `common.ts` son los union types que se usan en todo el proyecto. Definirlos aquí evita duplicarlos después. Ver schemas en `01-arquitectura` sección 3

---

### F3: Firebase project + Auth

**Qué:** Proyecto Firebase configurado con autenticación Google sign-in funcionando en la app.

**Criterio de done:**
- [ ] Existe un proyecto Firebase en la consola (nombre: `secondmind-app` o similar)
- [ ] Google sign-in funciona: el usuario ve botón "Sign in with Google", lo clickea, y queda autenticado
- [ ] La app muestra el nombre y avatar del usuario en el sidebar después de login
- [ ] Si no está autenticado, la app redirige a una pantalla de login
- [ ] Las variables de entorno de Firebase están en `.env.local` (NO commiteadas)
- [ ] `.env.local` está en `.gitignore`

**Archivos a crear:**
- `src/lib/firebase.ts` — Config singleton de Firebase (initializeApp, getAuth, getFirestore)
- `src/hooks/useAuth.ts` — Hook que expone `{ user, isLoading, signIn, signOut }` usando `onAuthStateChanged`
- `src/app/login/page.tsx` — Pantalla de login con botón "Sign in with Google"
- `.env.local` — `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc.
- `.env.example` — Template sin valores reales (se commitea como referencia)
- `.gitignore` — Agregar `.env.local`, `node_modules`, `dist`, `.firebase`

**Notas de implementación:**
- Usar `signInWithPopup` con `GoogleAuthProvider` — es el flujo más simple
- El hook `useAuth` debe manejar el estado de carga inicial (mientras Firebase verifica si hay sesión activa). Sin esto, la app flashea la pantalla de login antes de redirigir al dashboard
- Crear el proyecto Firebase con Firestore en modo producción (no test) — las security rules se configuran en F4

---

### F4: Firestore + Security Rules

**Qué:** Firestore configurado con las colecciones base y security rules que solo permiten al dueño acceder a sus datos.

**Criterio de done:**
- [ ] Desde la app, se puede escribir un documento en Firestore y leerlo de vuelta
- [ ] Un usuario NO puede leer datos de otro usuario (verificar cambiando el userId manualmente en la consola)
- [ ] El archivo `firestore.rules` está en el repo y se deploya con `firebase deploy --only firestore:rules`
- [ ] `firebase.json` está configurado con hosting y firestore rules

**Archivos a crear:**
- `firestore.rules` — Security rules: solo owner read/write bajo `users/{userId}/**`
- `firebase.json` — Config de Firebase: hosting (public: dist, SPA rewrite) + firestore rules path
- `.firebaserc` — Project alias

**Notas de implementación:**
- Security rules mínimas para esta fase (ver patrón en `03-convenciones` sección 12):
  ```
  match /users/{userId}/{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```
- NO crear colecciones manualmente en la consola. Se crean automáticamente cuando la app escribe el primer documento en F5

---

### F5: TinyBase + Persister Firestore

**Qué:** TinyBase configurado como data layer reactivo con sync bidireccional a Firestore. Verificar que los datos persisten después de recargar.

**Criterio de done:**
- [ ] Un store de TinyBase (notesStore) está creado con schema definido
- [ ] El persister Firestore está conectado y sincronizando
- [ ] Al escribir un valor en TinyBase, aparece en Firestore (verificar en consola Firebase)
- [ ] Al recargar la página, los datos de Firestore se cargan en TinyBase automáticamente
- [ ] Un componente React muestra datos del store usando `useCell()` y re-renderiza cuando cambian

**Archivos a crear:**
- `src/lib/tinybase.ts` — Creación del store, schema, y función `initPersister(userId)` que conecta a Firestore
- `src/stores/notesStore.ts` — Store de notas con schema: `{ title, paraType, noteType, linkCount, isFavorite, isArchived, aiProcessed, viewCount }`
- `src/hooks/useStoreInit.ts` — Hook que inicializa TinyBase + persister cuando el usuario está autenticado

**Notas de implementación:**
- TinyBase persister se inicializa DESPUÉS de auth (necesita el userId para el path de Firestore)
- El hook `useStoreInit` debe llamar `persister.startAutoLoad()` y `persister.startAutoSave()` en secuencia
- Para verificar el sync, crear un componente temporal de prueba que escriba/lea del store. Se elimina en Fase 1
- Ver configuración detallada de TinyBase en `01-arquitectura` sección 6
- IMPORTANT: Solo metadata en TinyBase, no content de notas. Ver decisión en `03-convenciones` sección 4

---

### F6: Deploy a Firebase Hosting

**Qué:** La app se deploya a Firebase Hosting con un comando y es accesible vía URL pública.

**Criterio de done:**
- [ ] `npm run deploy` ejecuta build + deploy exitosamente
- [ ] La app es accesible en `https://secondmind-app.web.app` (o URL asignada)
- [ ] Google sign-in funciona en producción (dominio autorizado en Firebase console)
- [ ] La app carga sin errores en producción (verificar console del browser)
- [ ] SPA routing funciona: al recargar en `/login`, no da 404

**Archivos a modificar:**
- `firebase.json` — Configurar hosting con `"rewrites": [{ "source": "**", "destination": "/index.html" }]`
- `package.json` — Agregar scripts: `"deploy": "npm run build && firebase deploy --only hosting"`

**Notas de implementación:**
- Agregar el dominio de Firebase Hosting (`secondmind-app.web.app`) a la lista de dominios autorizados en Firebase Console → Authentication → Settings → Authorized domains
- Verificar que las env vars de Firebase están hardcodeadas en el build (Vite las inlinea en build time desde `.env.local`). En producción esto es seguro — las API keys de Firebase son públicas por diseño

---

## Orden de implementación

1. **F1: Scaffold del proyecto** → Base sobre la que todo se construye
2. **F2: Estructura de carpetas** → Depende de F1. Define dónde va cada cosa
3. **F3: Firebase + Auth** → Depende de F1. Necesita el proyecto creado para configurar Firebase
4. **F4: Firestore + Rules** → Depende de F3. Necesita Firebase project y auth configurados
5. **F5: TinyBase + Persister** → Depende de F3 y F4. Necesita auth (userId) y Firestore funcionando
6. **F6: Deploy** → Depende de todo lo anterior. Verificación final de que todo funciona en producción

---

## Estructura de archivos nuevos

```
SecondMind/
├── .env.local                    # Variables Firebase (no commitear)
├── .env.example                  # Template de variables
├── .eslintrc.cjs
├── .firebaserc
├── .gitignore
├── .prettierrc
├── firebase.json
├── firestore.rules
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── index.css
    ├── app/
    │   ├── layout.tsx            # Layout con Sidebar + content area
    │   ├── page.tsx              # Dashboard placeholder
    │   └── login/
    │       └── page.tsx          # Pantalla de login
    ├── components/
    │   ├── ui/                   # shadcn/ui (auto-generados)
    │   └── layout/
    │       └── Sidebar.tsx       # Sidebar con nav items placeholder
    ├── hooks/
    │   ├── useAuth.ts            # Auth state + signIn/signOut
    │   └── useStoreInit.ts       # Init TinyBase + persister
    ├── lib/
    │   ├── firebase.ts           # Firebase config singleton
    │   └── tinybase.ts           # TinyBase config + persister factory
    ├── stores/
    │   └── notesStore.ts         # Store de notas (schema)
    └── types/
        └── common.ts             # ParaType, NoteType, Priority, etc.
```

---

## Checklist de completado

Al terminar Fase 0, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run dev` compila sin errores ni warnings de TypeScript
- [ ] `npm run build` genera bundle de producción
- [ ] `npm run lint` pasa sin errores
- [ ] Google sign-in funciona (login → ver nombre en sidebar → logout)
- [ ] Escribir en TinyBase persiste en Firestore (verificar en consola Firebase)
- [ ] Recargar la página recupera los datos de Firestore via TinyBase
- [ ] Security rules bloquean acceso a datos de otros usuarios
- [ ] La app está deployada y accesible en Firebase Hosting
- [ ] SPA routing funciona en producción (recargar en cualquier ruta no da 404)
- [ ] El repo tiene commits limpios con Conventional Commits

---

## Siguiente fase

**Fase 1 (MVP):** Quick Capture + Editor de notas con TipTap y WikiLinks + Lista de notas con búsqueda Orama + Backlinks + Inbox + Dashboard mínimo. La Fase 0 habilita todo esto al tener auth, data layer, y deploy funcionando.
