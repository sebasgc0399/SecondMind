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
]);
