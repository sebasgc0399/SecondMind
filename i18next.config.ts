import { defineConfig } from 'i18next-cli';

// Scoping por corrida de `instrument` (F1.5 / gates por dominio de F2): el CLI
// no acepta override de input por flag, así que el scope entra por env var.
// NUNCA correr `extract` con I18N_INSTRUMENT_SCOPE seteada — con removeUnusedKeys
// activo purgaría las keys de los archivos fuera del scope (por eso además queda
// en false hasta F4).
const scope = process.env.I18N_INSTRUMENT_SCOPE;

export default defineConfig({
  // es primero → primaryLanguage por default (D8 del SPEC-58)
  locales: ['es', 'en'],
  extract: {
    input: scope ? [scope] : ['src/**/*.{ts,tsx}'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
    // D9 del SPEC-58: functions tiene package.json propio sin react-i18next;
    // ui/ es shadcn (no editar); tests assertean contra el catálogo, no se
    // instrumentan; locales/types/test son artefactos del propio pipeline.
    ignore: [
      'src/functions/**',
      '**/*.{test,spec}.*',
      'src/components/ui/**',
      'src/locales/**',
      'src/types/**',
      'src/test/**',
    ],
    defaultNS: 'translation', // D7: namespace único, keys jerárquicas por dominio
    keySeparator: '.',
    primaryLanguage: 'es',
    sort: true,
    // false durante F1–F2: protege contra un extract con scope acotado que
    // purgaría keys ajenas al dominio en curso. Se flipea a true en F4 (cleanup
    // final con `i18next-cli status`).
    removeUnusedKeys: false,
    defaultValue: '',
    // D1/D5/D9: datos PERSISTIDOS jamás se instrumentan — sus strings se
    // localizan al momento de creación (manual), no por catálogo de render.
    instrumentScorer: (_content, { file }) => {
      const normalized = file.replace(/\\/g, '/');
      if (normalized.includes('src/types/area.ts')) return null;
      if (normalized.includes('src/types/habit.ts')) return null;
      if (normalized.includes('src/components/editor/templates/')) return null;
      return undefined; // heurística built-in para el resto
    },
  },
  types: {
    input: ['src/locales/es/*.json'],
    output: 'src/types/i18next.d.ts',
    resourcesFile: 'src/types/resources.d.ts',
  },
});
