import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    'dist',
    'src/components/ui',
    'src/functions',
    'android/app/build',
    'src-tauri/target',
    'extension',
    'landing/.astro', // artefactos generados por Astro (content.d.ts/types.d.ts)
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            { pattern: 'react', group: 'builtin', position: 'before' },
            { pattern: '@/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'never',
        },
      ],
    },
  },
  {
    // F38.4 — guard rail Clean Arch: capa 2 (components/hooks) no debe
    // importar Firestore/Auth directo. Excepciones documentadas en
    // Docs/04 § Excepciones reconocidas. `allowTypeImports: true` cubre
    // la excepción #3 (type imports externos en capa 2).
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    ignores: [
      '**/useNote.ts', // Excepción #2 — lectura one-shot MVP
      '**/useAuth.ts', // Excepción #1 — auth multi-plataforma
      '**/*.test.{ts,tsx}', // Tests pueden mockear firebase/* directo
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/firestore',
              message:
                'Capa 2 (components/hooks) no debe importar Firestore directo. Usar un repo en src/infra/repos/. Ver Docs/04-clean-architecture-frontend.md § Excepciones reconocidas.',
              allowTypeImports: true,
            },
            {
              name: 'firebase/auth',
              message:
                'Capa 2 no debe importar firebase/auth (values). Usar useAuth o un repo. Type imports OK por excepción #3 Docs/04.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    // Cierre Clean Arch — guard rail capa 2: los hooks de prod NO deben mutar
    // un store TinyBase directo. Todo write pasa por un repo de src/infra/repos/
    // (factory createFirestoreRepo) que centraliza el optimistic setRow→setDoc +
    // queue de retry. Cierra el punto ciego que dejó pasar useResurfacing (A1):
    // el guard de imports de arriba solo ve `import`, no mutaciones sobre un store
    // ya importado del módulo stores/. Scope hooks-only (NO components) a propósito:
    // QuickCaptureProvider en components/ usa setRow directo por diseño (F42.1 D2).
    // delTable queda fuera de la lista: useStoreInit lo usa para el cleanup F11.
    // Tests exentos: seedean el store con setRow/delTable en el setup.
    files: ['src/hooks/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ":matches(CallExpression[callee.property.name='setRow'], CallExpression[callee.property.name='setPartialRow'], CallExpression[callee.property.name='setCell'], CallExpression[callee.property.name='delRow'])",
          message:
            'Capa 2 (hooks) no debe mutar un store TinyBase directo (setRow/setPartialRow/setCell/delRow). Usar un repo en src/infra/repos/ — el factory createFirestoreRepo centraliza el patrón optimistic + queue. Ver Docs/04-clean-architecture-frontend.md § Excepciones reconocidas.',
        },
      ],
    },
  },
]);
