# SPEC — SecondMind · Fase 0: Setup (Completada)

> Registro de lo implementado en la fase de setup inicial.
> Completada: Abril 2026

---

## Objetivo

Infraestructura completa: auth con Google, data layer reactivo con TinyBase + Firestore, deploy a Firebase Hosting. Sin funcionalidad para el usuario final.

---

## Features implementadas

### F1: Proyecto Vite + React 19 + TypeScript + Tailwind

Scaffold con Vite + React 19.2 + TypeScript strict. Path alias `@/` configurado en Vite y tsconfig. Prettier con single quotes, trailing commas, 100 chars.

### F2: Estructura de carpetas base

Estructura por feature: `app/`, `components/layout/`, `components/ui/`, `hooks/`, `lib/`, `stores/`, `types/`. Sidebar con los 7 items de navegacion (sin routing). Tipos compartidos en `types/common.ts`: `ParaType`, `NoteType`, `Priority`, `TaskStatus`, `ProjectStatus`.

### F3: Firebase + Auth

Firebase project `secondmindv1`. Google sign-in con `signInWithPopup`. Hook `useAuth` expone `{ user, isLoading, signIn, signOut }` via `onAuthStateChanged`. Pantalla de login en `app/login/page.tsx`. Variables de entorno en `.env.local` (no commiteadas), template en `.env.example`.

### F4: Firestore + Security Rules

Security rules: solo el owner lee/escribe bajo `users/{userId}/**`. Configurado en `firestore.rules`, deployable con `firebase deploy --only firestore:rules`.

### F5: TinyBase + Persister Firestore

Store `notesStore` con schema: title, contentPlain, paraType, noteType, distillLevel, linkCount, isFavorite, isArchived, aiProcessed, viewCount. Persister custom conectado a Firestore con sync bidireccional (autoLoad + autoSave). Componente temporal SyncTest en dashboard para verificar el flujo end-to-end (se elimina en Fase 1).

### F6: Deploy a Firebase Hosting

Deploy funcional en Firebase Hosting (site: `secondmind`). SPA rewrite configurado. Google sign-in funciona en produccion.

---

## Decisiones tecnicas que cambiaron vs lo planeado

| Planeado                                | Implementado                                                 | Razon                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.eslintrc.cjs` (legacy config)         | `eslint.config.js` (flat config)                             | ESLint 9+ depreca el formato legacy. Flat config con `defineConfig()`, plugins de typescript-eslint, react-hooks, react-refresh, import order                                      |
| `tailwind.config.ts` + PostCSS clasico  | Tailwind v4 CSS-first (`@import 'tailwindcss'` en index.css) | Tailwind v4 elimina el archivo de config JS. Tema definido con `@theme inline` y CSS variables en oklch(). PostCSS usa `@tailwindcss/postcss`                                      |
| shadcn/ui sobre Radix UI                | shadcn/ui sobre Base UI (`@base-ui/react`)                   | Estilo `base-nova` de shadcn usa Base UI en vez de Radix. Solo componente Button instalado en esta fase                                                                            |
| TinyBase persister oficial de Firestore | Custom persister con `createCustomPersister()`               | TinyBase v8 requirio persister custom: `getPersisted()` lee coleccion, `setPersisted()` escribe docs individuales, `addPersisterListener()` usa `onSnapshot()` para sync real-time |

---

## Archivos creados

**Config raiz:** `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `eslint.config.js`, `.prettierrc`, `postcss.config.js`, `firebase.json`, `firestore.rules`, `.firebaserc`, `components.json`, `.env.example`

**Aplicacion:**

- `src/main.tsx` — Entry point con TinyBase Provider
- `src/index.css` — Tailwind v4 theme + variables CSS shadcn/ui
- `src/lib/firebase.ts` — Firebase singleton (auth + db)
- `src/lib/tinybase.ts` — Custom Firestore persister
- `src/lib/utils.ts` — Utilidad `cn()` para clases
- `src/stores/notesStore.ts` — Schema del store de notas
- `src/hooks/useAuth.ts` — Auth state + signIn/signOut
- `src/hooks/useStoreInit.ts` — Lifecycle del persister
- `src/types/common.ts` — Union types del dominio
- `src/app/layout.tsx` — Layout raiz con auth flow
- `src/app/page.tsx` — Dashboard placeholder + SyncTest
- `src/app/login/page.tsx` — Pantalla de login
- `src/components/layout/Sidebar.tsx` — Sidebar con nav items
- `src/components/ui/button.tsx` — shadcn Button (Base UI)

---

## Checklist de completado

- [x] `npm run dev` compila sin errores ni warnings de TypeScript
- [x] `npm run build` genera bundle de produccion
- [x] `npm run lint` pasa sin errores
- [x] Google sign-in funciona (login -> ver nombre en sidebar -> logout)
- [x] Escribir en TinyBase persiste en Firestore
- [x] Recargar la pagina recupera los datos via TinyBase
- [x] Security rules bloquean acceso a datos de otros usuarios
- [x] App deployada y accesible en Firebase Hosting
- [x] SPA routing funciona en produccion
- [x] Commits limpios con Conventional Commits

---

## Dependencias clave

React 19.2, Firebase 12.12, TinyBase 8.1, Tailwind 4.2, @base-ui/react 1.3, shadcn 4.2, lucide-react 1.8, class-variance-authority 0.7
