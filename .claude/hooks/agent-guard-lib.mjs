// agent-guard-lib — lógica pura del hook PreToolUse de SPEC-69 T2 (invariante I1).
//
// `evaluate(input, env)` no toca disco ni procesos: todo lo que depende del
// entorno (sentinels, rama actual) llega por `env`. El wrapper
// `agent-guard.mjs` arma ese `env` y traduce la decisión a exit 0 / exit 2.
//
// Criterio general: en modo restringido un falso positivo es aceptable (el
// agente se detiene y reporta), un falso negativo no (puede tocar prod). Por
// eso cada regla de Bash tiene dos capas: análisis por argv (preciso) y una
// red de seguridad por regex sobre el texto crudo (gruesa).

const STOP = 'detenete y reportá al orquestador';

// Tags de cierre de tanda (decisión E0-T1-a). Cualquier otro nombre, en
// particular `v*`, dispara release.yml si llega a pushearse.
export const TAG_ETAPA = /^e\d+-T\d+[a-z]?$/;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/** Normaliza a minúsculas, `/`, sin `.`/`..`, y `/d/x` (Git Bash) → `d:/x`. */
export function normalizePath(p, baseDir) {
  if (typeof p !== 'string' || p === '') return '';
  let s = p.replace(/\\/g, '/');
  if (/^\/[a-zA-Z]\//.test(s)) s = `${s[1]}:${s.slice(2)}`;
  const isAbs = /^[a-zA-Z]:\//.test(s) || s.startsWith('/');
  if (!isAbs && baseDir) s = `${normalizePath(baseDir)}/${s}`;
  const out = [];
  for (const part of s.split('/')) {
    if (part === '' || part === '.') {
      if (out.length === 0) out.push(part);
      continue;
    }
    if (part === '..') {
      if (out.length > 1) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/').toLowerCase();
}

/** Ruta relativa al proyecto (normalizada) o null si está afuera. */
function relToProject(abs, projectDir) {
  const root = normalizePath(projectDir);
  if (!root) return null;
  if (abs === root) return '';
  return abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : null;
}

const SENTINELS = new Set(['.claude/loop.active', '.claude/guard.unlock']);

/**
 * ¿La ruta es protegida? Devuelve 'sentinel' | 'config' | null.
 * - sentinel: `.claude/loop.active` y `.claude/guard.unlock` del proyecto. Nunca
 *   escribibles en modo restringido: crearlos/borrarlos cambia el propio modo.
 * - config: el código del guard y cualquier settings de Claude Code (proyecto o
 *   usuario). Editarlos permitiría desactivar el hook (p.ej. `disableAllHooks`).
 */
export function protectedKind(abs, projectDir) {
  const rel = relToProject(abs, projectDir);
  if (rel !== null && SENTINELS.has(rel)) return 'sentinel';
  if (rel !== null && (rel === '.claude/hooks' || rel.startsWith('.claude/hooks/')))
    return 'config';
  if (/(^|\/)\.claude\/settings(\.local)?\.json$/.test(abs)) return 'config';
  return null;
}

// ---------------------------------------------------------------------------
// Tokenizador de shell (aproximado, conservador)
// ---------------------------------------------------------------------------

const NESTED = /[\s;&|`()]|\$\(/;
const HEREDOC = /<<-?\s*['"]?[A-Za-z_]/;

// Programas que ejecutan un string como comando de shell. El string se vuelve a
// analizar en modo 'shell' (preciso).
const SHELL_C = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'su', 'script']);
const JOIN_ALL = new Set([
  'eval',
  'iex',
  'invoke-expression',
  'wsl',
  'concurrently',
  'start-process',
]);
// Intérpretes cuyo argumento es código: sus literales pueden ser comandos
// (`execSync('git push')`, `os.system("...")`), así que se analizan en modo
// 'code' (todo token con sintaxis de shell se re-analiza, como antes de E0-T2-h).
const CODE_FLAG = {
  node: /^(-e|--eval|-p|--print|-pe|-ep)$/,
  bun: /^(-e|--eval|-p|--print)$/,
  deno: /^(eval)$/,
  python: /^-[a-zA-Z]*c$/,
  python3: /^-[a-zA-Z]*c$/,
  py: /^-[a-zA-Z]*c$/,
  perl: /^-[a-zA-Z]*[eE]$/,
  ruby: /^-[a-zA-Z]*[eE]$/,
};

/** Strings anidados de un comando simple que deben re-analizarse. */
function nestedSources(argv) {
  const shell = [];
  const code = [];
  const ps = [];
  for (let i = 0; i < argv.length; i++) {
    const n = programName(argv[i]);
    const rest = argv.slice(i + 1);
    if (SHELL_C.has(n)) {
      const j = rest.findIndex((t) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(t));
      if (j >= 0) shell.push(rest.slice(j + 1).join(' '));
    } else if (n === 'powershell' || n === 'pwsh') {
      // Todo lo que sigue a -Command (o abreviado) es el comando; sin -Command,
      // PowerShell 5.1 ejecuta el primer argumento posicional.
      const j = rest.findIndex((t) => /^[-/]c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(t));
      if (j >= 0) ps.push(rest.slice(j + 1).join(' '));
      else for (const t of rest) if (!/^[-/]/.test(t)) ps.push(t);
    } else if (JOIN_ALL.has(n)) {
      shell.push(rest.join(' '));
    } else if (n === 'cmd') {
      const j = rest.findIndex((t) => /^\/[ck]$/i.test(t));
      if (j >= 0) shell.push(rest.slice(j + 1).join(' '));
    } else if (CODE_FLAG[n]) {
      rest.forEach((t, j) => {
        if (CODE_FLAG[n].test(t) && rest[j + 1] !== undefined) code.push(rest[j + 1]);
        const eq = t.match(/^--(eval|print)=(.*)$/s);
        if (eq) code.push(eq[2]);
      });
    } else if (n === 'firebase') {
      const j = rest.indexOf('emulators:exec');
      if (j >= 0) {
        for (let k = j + 1; k < rest.length; k++) {
          if (FIREBASE_VALUE.has(rest[k])) k++;
          else if (!rest[k].startsWith('-')) shell.push(rest[k]);
        }
      }
    } else if (n === 'npx' || n === 'npm' || n === 'nodemon') {
      rest.forEach((t, j) => {
        if (['-c', '--call', '--exec'].includes(t) && rest[j + 1] !== undefined)
          shell.push(rest[j + 1]);
      });
    }
  }
  // `$(…)` y backticks dentro de un token (p.ej. entre comillas dobles).
  for (const t of argv) {
    const k = t.search(/\$\(|`/);
    if (k >= 0) shell.push(t.slice(k));
  }
  return { shell, code, ps };
}

/**
 * Parte un string de shell en comandos simples (arrays de argv). Respeta
 * comillas simples/dobles y escapes; corta en `;`, `&`, `|`, saltos de línea,
 * paréntesis, backticks y `$(`.
 *
 * Re-análisis de strings anidados (E0-T2-h). En modo 'shell' solo se vuelven a
 * analizar los strings que la shell ejecuta: el argumento de `bash/sh -c`,
 * `powershell/pwsh`, `cmd /c`, `eval`, `firebase emulators:exec`, `npx -c`, y
 * los cuerpos `$(…)`/backticks; el código de `node -e`/`python -c`/`perl -e`
 * va en modo 'code'. Un patrón de búsqueda (`grep 'a|b'`) ya no se toma como
 * comando. En modo 'code' (y si el comando trae un heredoc) se re-analiza todo
 * token con sintaxis de shell, porque sus literales pueden ser comandos.
 *
 * En profundidad 0, cada argv lleva `spans` (posición en `src`, si tenía
 * comillas/escapes y si es destino de una redirección) para enmascarar
 * patrones de búsqueda antes de la red cruda.
 */
export function splitCommands(src, depth = 0, mode = 'shell') {
  // PowerShell: `& $x` / `. $x` invocan lo que diga la variable.
  const psCall = mode === 'ps' && /(^|[\s;|{(])[&.]\s*\$/.test(src);
  const cmds = [];
  let argv = [];
  let spans = [];
  let tok = '';
  let has = false;
  let start = -1;
  let quoted = false;
  let redirect = false;
  const pushTok = (end) => {
    if (has) {
      argv.push(tok);
      spans.push({ start, end, quoted, redirect });
      redirect = false;
    }
    tok = '';
    has = false;
    start = -1;
    quoted = false;
  };
  const endCmd = (end) => {
    pushTok(end);
    if (argv.length) {
      if (depth === 0) argv.spans = spans;
      argv.mode = mode;
      if (psCall) argv.psCall = true;
      cmds.push(argv);
    }
    argv = [];
    spans = [];
    redirect = false;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (start < 0 && !/[\s;&|\n\r()`<>]/.test(c) && !(c === '$' && src[i + 1] === '(')) {
      start = i;
    }
    if (c === "'" || c === '"' || c === '\\') quoted = true;
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j < 0 ? src.length : j;
      tok += src.slice(i + 1, end);
      has = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length && '"\\$`'.includes(src[i + 1])) {
          tok += src[i + 1];
          i += 2;
          continue;
        }
        tok += src[i];
        i++;
      }
      has = true;
      i++;
      continue;
    }
    if (c === '\\') {
      if (src[i + 1] === '\n') {
        i += 2;
        continue;
      }
      if (i + 1 < src.length) {
        tok += src[i + 1];
        has = true;
      }
      i += 2;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      endCmd(i);
      i += 2;
      continue;
    }
    if (';&|\n\r()`'.includes(c)) {
      endCmd(i);
      i++;
      continue;
    }
    if (c === '<' || c === '>') {
      pushTok(i);
      if (c === '>') redirect = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      pushTok(i);
      i++;
      continue;
    }
    tok += c;
    has = true;
    i++;
  }
  endCmd(src.length);
  if (depth >= 4) return cmds;
  const generic = mode === 'code' || HEREDOC.test(src);
  const nested = [];
  for (const cmd of cmds) {
    if (generic) {
      for (const t of cmd) {
        if (NESTED.test(t)) nested.push(...splitCommands(t, depth + 1, 'code'));
      }
      continue;
    }
    const { shell, code, ps } = nestedSources(cmd);
    for (const s of shell) nested.push(...splitCommands(s, depth + 1, 'shell'));
    for (const s of code) nested.push(...splitCommands(s, depth + 1, 'code'));
    for (const s of ps) nested.push(...splitCommands(s, depth + 1, 'ps'));
  }
  return cmds.concat(nested);
}

/**
 * Nombre de programa de un token: basename, sin `@versión` (`vite@8`, `@scope/pkg@1`) ni
 * extensión de ejecutable. Los entry points de vite (`…/vite/bin/vite.js`,
 * `…/vite/dist/node/cli.js`) cuentan como `vite`.
 */
export function programName(tok) {
  const s = String(tok).replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)vite\/(.*\/)?(cli|vite)\.[cm]?js$/.test(s)) return 'vite';
  const base = s
    .split('/')
    .pop()
    .replace(/(.)@[^@]*$/, '$1');
  if (base.includes('firebase-tools')) return 'firebase';
  return base.replace(/\.(exe|cmd|bat|ps1|js|mjs|cjs)$/, '');
}

// Palabras que pueden preceder al programa real (`sudo git push`, `npx firebase`,
// `node .../firebase.js`, `xargs git push`...). Tras ellas se saltean opciones.
const PREFIXES = new Set([
  'sudo',
  'env',
  'time',
  'nohup',
  'exec',
  'command',
  'builtin',
  'xargs',
  'nice',
  'timeout',
  'npx',
  'pnpx',
  'bunx',
  'dlx',
  'node',
  'call',
  'start',
  'if',
  'then',
  'else',
  'elif',
  'do',
  'while',
  'until',
  '!',
  '{',
  '}',
  '.',
  'source',
  '&',
  'winpty',
]);

/** Devuelve [programa, args] del comando simple, saltando prefijos y `VAR=x`. */
function resolveProgram(argv) {
  let i = 0;
  let afterPrefix = false;
  while (i < argv.length) {
    const t = argv[i];
    const n = programName(t);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      i++;
      continue;
    }
    if (PREFIXES.has(n)) {
      afterPrefix = true;
      i++;
      continue;
    }
    if (afterPrefix && t.startsWith('-')) {
      i++;
      continue;
    }
    // `pnpm dlx x`, `yarn dlx x`, `pnpm exec x`, `yarn exec x`, `npm exec x` → el programa es x
    if ((n === 'pnpm' || n === 'yarn') && (argv[i + 1] === 'dlx' || argv[i + 1] === 'exec')) {
      i += 2;
      afterPrefix = true;
      continue;
    }
    if (n === 'npm' && (argv[i + 1] === 'exec' || argv[i + 1] === 'x')) {
      i += 2;
      afterPrefix = true;
      continue;
    }
    return [n, argv.slice(i + 1), t];
  }
  return [null, [], null];
}

// ---------------------------------------------------------------------------
// Reglas por programa (argv)
// ---------------------------------------------------------------------------

const GIT_GLOBAL_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
  '--super-prefix',
]);

function parseGit(args) {
  let i = 0;
  const configs = [];
  while (i < args.length && args[i].startsWith('-')) {
    const t = args[i];
    if (GIT_GLOBAL_WITH_VALUE.has(t)) {
      if (t === '-c' || t === '--config-env') configs.push(args[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (t.startsWith('-c') && t.length > 2) configs.push(t.slice(2));
    i++;
  }
  return { sub: args[i] ?? '', rest: args.slice(i + 1), configs };
}

/** git tag: permitido listar y crear `e<N>-T<n>`; bloquea borrar/forzar/otros nombres. */
function gitTagViolation(rest) {
  const LIST = new Set([
    '-l',
    '--list',
    '--contains',
    '--no-contains',
    '--points-at',
    '--merged',
    '--no-merged',
  ]);
  const VALUE = new Set([
    '-m',
    '-F',
    '-u',
    '--local-user',
    '--cleanup',
    '--sort',
    '--format',
    '--color',
    '--file',
    '--message',
  ]);
  const positional = [];
  let listing = false;
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === '-d' || t === '--delete' || t === '-f' || t === '--force') {
      return `git tag ${t} (borrar/forzar tags)`;
    }
    if (/^-[a-zA-Z]+$/.test(t) && t.length > 2 && /[df]/.test(t.slice(1))) {
      return `git tag ${t} (borrar/forzar tags)`;
    }
    if (
      LIST.has(t) ||
      t.startsWith('--list=') ||
      t.startsWith('--contains=') ||
      t.startsWith('--points-at=')
    ) {
      listing = true;
      if (
        t === '--contains' ||
        t === '--points-at' ||
        t === '--merged' ||
        t === '--no-merged' ||
        t === '--no-contains'
      )
        i++;
      continue;
    }
    if (VALUE.has(t)) {
      i++;
      continue;
    }
    if (/^-[a-zA-Z]*[mFu]$/.test(t)) {
      i++;
      continue;
    }
    if (t.startsWith('-')) continue;
    positional.push(t);
  }
  if (listing || positional.length === 0) return null;
  if (!TAG_ETAPA.test(positional[0]))
    return `git tag ${positional[0]} (solo se permiten tags de etapa e<N>-T<n>)`;
  return null;
}

const isMainRef = (t) => t === 'main' || t === 'refs/heads/main';

function ruleGit(args) {
  const { sub, rest, configs } = parseGit(args);
  // Un alias de git (`-c alias.x=push`, `git config alias.x push`) esconde el
  // subcomando real: no hay forma determinista de saber qué ejecuta.
  if (configs.some((c) => /^alias\./i.test(c)))
    return ['git-alias', 'git -c alias.* (alias de git no verificable)'];
  if (sub === 'config' && rest.some((t) => /^alias\./i.test(t)))
    return ['git-alias', 'git config alias.* (alias de git no verificable)'];
  if (sub === 'push' || sub === 'send-pack' || sub === 'http-push')
    return ['git-push', `git ${sub}`];
  if (sub === 'tag') {
    const v = gitTagViolation(rest);
    return v ? ['git-tag', v] : null;
  }
  if (sub === 'merge' || sub === 'rebase' || sub === 'update-ref')
    return ['git-history', `git ${sub}`];
  // Archivos ignorados: `.claude/loop.active` (cortaría el loop en silencio) y
  // `.env*`. `git clean -x/-X` los borra; `git stash -u/-a` los mueve al stash.
  const shortHas = (re) => rest.some((t) => /^-[^-]/.test(t) && re.test(t.slice(1)));
  if (sub === 'clean' && shortHas(/[xX]/))
    return ['git-ignored', 'git clean -x/-X (borra archivos ignorados: .env*, loop.active)'];
  if (
    sub === 'stash' &&
    (shortHas(/[au]/) || rest.some((t) => t === '--all' || t === '--include-untracked'))
  )
    return ['git-ignored', 'git stash -u/-a (mueve archivos no versionados o ignorados)'];
  // Refspec que escribe en main (`git fetch . HEAD:main`, `x:refs/heads/main`).
  if (rest.some((t) => /^\+?[^:\s]*:(refs\/heads\/)?main$/.test(t)))
    return ['git-history', `git ${sub} <refspec>:main`];
  if (sub === 'worktree' && rest[0] === 'add' && rest.some((t) => isMainRef(t)))
    return ['git-history', 'git worktree add … main'];
  if (
    (sub === 'checkout' || sub === 'switch') &&
    rest.some((t) => t === 'main' || t === 'refs/heads/main')
  ) {
    return ['git-history', `git ${sub} main`];
  }
  if (sub === 'branch') {
    if (rest.some((t) => t === '-M' || t === '-C' || /^-[a-zA-Z]*M/.test(t)))
      return ['git-history', 'git branch -M/-C'];
    const touchesMain = rest.includes('main');
    const dangerous = rest.some((t) =>
      ['-f', '--force', '-D', '-d', '--delete', '-m', '--move', '-c', '--copy'].includes(t),
    );
    if (touchesMain && dangerous)
      return ['git-history', 'git branch (forzar/borrar/renombrar main)'];
  }
  if (sub === 'reset' && rest.includes('--hard')) return ['git-history', 'git reset --hard'];
  return null;
}

function ruleGh(args) {
  const words = args.filter((t) => !t.startsWith('-'));
  const [a, b] = words;
  if (a === 'release') return ['gh', 'gh release'];
  if (a === 'pr' && (b === 'merge' || b === 'create')) return ['gh', `gh pr ${b}`];
  if (a === 'workflow' && ['run', 'enable', 'disable'].includes(b))
    return ['gh', `gh workflow ${b}`];
  if (a === 'run' && ['rerun', 'cancel', 'delete'].includes(b)) return ['gh', `gh run ${b}`];
  if (a === 'repo' && ['delete', 'sync', 'edit', 'rename', 'archive'].includes(b))
    return ['gh', `gh repo ${b}`];
  if ((a === 'secret' || a === 'variable') && ['set', 'delete', 'remove'].includes(b))
    return ['gh', `gh ${a} ${b}`];
  if (a === 'api') {
    let method = null;
    let hasBody = false;
    for (let i = 0; i < args.length; i++) {
      const t = args[i];
      if (t === '-X' || t === '--method') method = (args[i + 1] ?? '').toUpperCase();
      else if (/^-X./.test(t)) method = t.slice(2).toUpperCase();
      else if (t.startsWith('--method=')) method = t.slice(9).toUpperCase();
      if (
        ['-f', '-F', '--field', '--raw-field', '--input'].includes(t) ||
        /^--(raw-)?field=/.test(t)
      )
        hasBody = true;
    }
    // gh api con campos usa POST por defecto si no se fija el método.
    if ((method && method !== 'GET') || (hasBody && method !== 'GET'))
      return ['gh', `gh api (método ${method ?? 'POST implícito'})`];
  }
  return null;
}

const FIREBASE_VALUE = new Set([
  '--project',
  '-P',
  '--config',
  '-c',
  '--token',
  '--account',
  '--only',
  '--except',
  '--import',
  '--export-on-exit',
]);
const FIREBASE_DANGEROUS =
  /^(deploy|functions:|hosting:|apphosting|ext:|ext$|auth:import|firestore:(delete|databases:(create|update|delete|restore))|database:(set|push|update|remove|instances:create)|remoteconfig:rollback|projects:create|target:apply|use$)/;

function ruleFirebase(args) {
  if (args.some((t) => /secondmindv1/i.test(t)))
    return ['firebase', 'firebase con secondmindv1 (proyecto real)'];
  let sub = '';
  let demo = false;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--project' || t === '-P') {
      if (/^demo-/.test(args[i + 1] ?? '')) demo = true;
    }
    if (/^(--project|-P)=demo-/.test(t)) demo = true;
    if (FIREBASE_VALUE.has(t)) {
      i++;
      continue;
    }
    if (!sub && !t.startsWith('-')) sub = t;
  }
  if (FIREBASE_DANGEROUS.test(sub)) return ['firebase', `firebase ${sub}`];
  // Sin --project demo-* el CLI usa el default de .firebaserc (secondmindv1).
  // También para emulators:*: un emulador con proyecto real puede alcanzar
  // servicios reales no emulados (decisión E0-T2-c).
  if (!demo)
    return [
      'firebase',
      `firebase ${sub || ''} sin --project demo-* (el default es el proyecto real)`.replace(
        /\s+/g,
        ' ',
      ),
    ];
  return null;
}

const PROD_HOSTS = /googleapis\.com|secondmindv1|cloudfunctions\.net|firebaseio\.com/i;

function ruleHttp(args, name) {
  if (args.some((t) => PROD_HOSTS.test(t)))
    return ['http-prod', `${name} a APIs de Google/proyecto real`];
  return null;
}

function rulePackageManager(args, name) {
  // npm run deploy*, npm --prefix src/functions run deploy, pnpm deploy, yarn release...
  for (const t of args) {
    if (t.startsWith('-')) continue;
    if (
      /^(deploy|release)/i.test(t) ||
      /^cap:/i.test(t) ||
      /^tauri:build$/i.test(t) ||
      t === 'publish'
    ) {
      return ['scripts-prod', `${name} ${t} (deploy/release/build nativo)`];
    }
  }
  return null;
}

function ruleGradle(args) {
  if (args.some((t) => /(assemble|bundle)Release|publish/i.test(t)))
    return ['scripts-prod', 'gradlew release/publish'];
  return null;
}

function ruleTauri(args) {
  if (args.includes('build')) return ['scripts-prod', 'tauri build'];
  // `tauri dev` abre la app nativa con la config real (`.env.local`).
  if (args.includes('dev')) return ['dev-prod', 'tauri dev (app con la config de producción)'];
  return null;
}

// Opciones de Vite (8.0.8, `vite/dist/node/cli.js`) que nunca consumen el token siguiente: las
// booleanas globales. Cualquier otra puede hacerlo: cac/mri toma el token siguiente como valor
// de una opción con valor (`-c`, `--base`, `-l`, `--configLoader`, `-f`, `-m`, `--port`,
// `--outDir`, `--host [x]`, `--open [x]`, `-d [x]`, `--ssr [x]`…) y también de una booleana que
// el subcomando no declara (`vite --force build` = dev server con root `build`).
const VITE_NO_VALUE = new Set([
  '--clearScreen',
  '--no-clearScreen',
  '-h',
  '--help',
  '-v',
  '--version',
]);

/** Subcomando de vite: el primer posicional, saltando el posible valor de cada opción. */
function viteSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--') return null;
    if (t.startsWith('-')) {
      if (!t.includes('=') && !VITE_NO_VALUE.has(t) && args[i + 1] && !args[i + 1].startsWith('-'))
        i++;
      continue;
    }
    return t;
  }
  return null;
}

// Dev server: sin `--mode emulator` Vite carga `.env.local` (config de producción) y la app
// de localhost habla con el proyecto real. `preview` (en cualquier posición) sirve un build de
// producción. `build` y `optimize` no levantan nada, pero solo cuentan como subcomando.
function ruleVite(args) {
  if (args.includes('preview')) return ['dev-prod', 'vite preview (sirve un build de producción)'];
  const sub = viteSubcommand(args);
  if (sub === 'build' || sub === 'optimize') return null;
  let mode = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--mode' || t === '-m') mode = args[i + 1] ?? '';
    else if (t.startsWith('--mode=')) mode = t.slice('--mode='.length);
  }
  if (mode !== null && DYNAMIC_WORD.test(mode))
    return ['dynamic', 'vite --mode dado por una variable (no verificable)'];
  if (mode !== 'emulator')
    return [
      'dev-prod',
      'vite dev server sin --mode emulator (config de producción); usá npm run dev:emu',
    ];
  return null;
}

const PROGRAM_RULES = {
  git: ruleGit,
  gh: ruleGh,
  firebase: ruleFirebase,
  gcloud: () => ['gcloud', 'gcloud (cualquier uso)'],
  gsutil: () => ['gcloud', 'gsutil (cualquier uso)'],
  curl: (a) => ruleHttp(a, 'curl'),
  wget: (a) => ruleHttp(a, 'wget'),
  'invoke-webrequest': (a) => ruleHttp(a, 'Invoke-WebRequest'),
  'invoke-restmethod': (a) => ruleHttp(a, 'Invoke-RestMethod'),
  iwr: (a) => ruleHttp(a, 'iwr'),
  irm: (a) => ruleHttp(a, 'irm'),
  npm: (a) => rulePackageManager(a, 'npm'),
  pnpm: (a) => rulePackageManager(a, 'pnpm'),
  yarn: (a) => rulePackageManager(a, 'yarn'),
  bun: (a) => rulePackageManager(a, 'bun'),
  cap: () => ['scripts-prod', 'cap (Capacitor CLI)'],
  gradlew: ruleGradle,
  tauri: ruleTauri,
  cargo: (a) => (a[0] === 'tauri' ? ruleTauri(a.slice(1)) : null),
  vite: ruleVite,
  eval: () => ['dynamic', 'eval (comando no verificable)'],
};

// ---------------------------------------------------------------------------
// Red de seguridad sobre el texto crudo (sin comillas, minúsculas, `\`→`/`)
// ---------------------------------------------------------------------------

const RAW_NETS = [
  ['git-push', /\bgit\b[^;&|\n]*\b(push|send-pack|http-push)\b/, 'git push (red de seguridad)'],
  ['git-tag', /\bgit\b[^;&|\n]*\btag\b[^;&|\n]*\bv\d/, 'git tag v* (red de seguridad)'],
  ['gcloud', /\b(gcloud|gsutil)\b/, 'gcloud/gsutil (red de seguridad)'],
  [
    'firebase',
    /\bfirebase(-tools)?\b[^;&|\n]*\b(deploy|functions:|hosting:|apphosting|ext:|auth:import|firestore:delete)/,
    'firebase deploy/escritura (red de seguridad)',
  ],
  [
    'scripts-prod',
    /\b(npm|pnpm|yarn)\b[^;&|\n]*\brun\b[^;&|\n]*\b(deploy|release|cap:|tauri:build)/,
    'script de deploy/release (red de seguridad)',
  ],
];

// Hosts de Google/Firebase y el proyecto real. Cualquier mención en un comando se bloquea,
// también dentro de `node -e`, `python -c` o un heredoc (`fetch('https://firestore.googleapis.com/…')`).
// Los patrones de búsqueda entre comillas ya llegan blanqueados (maskSearchPatterns).
export const PROD_REFS =
  /googleapis\.com|cloudfunctions\.net|firebaseio\.com|secondmindv1|getsecondmind\.co/i;

function rawNet(flat) {
  for (const [id, re, why] of RAW_NETS) if (re.test(flat)) return [id, why];
  if (PROD_REFS.test(flat))
    return ['http-prod', 'referencia a hosts de Google o al proyecto real (secondmindv1)'];
  return null;
}

// --- Escrituras a rutas protegidas desde la shell -------------------------

const P_ALL =
  /\.claude\/(hooks\b|settings(\.local)?\.json|loop\.active|guard\.unlock)|\.claude\/?(\*|\s|$)|(^|[\s=])(settings(\.local)?\.json|loop\.active|guard\.unlock)\b|agent-guard|(^|\s)hooks(\/|\s|$)/;
// Igual sin `hooks/` suelto: un relativo `hooks/…` solo llega a `.claude/hooks` si el
// comando está (o entra) en `.claude`; desde `src` es `src/hooks/` (código de la app).
const P_NO_BARE_HOOKS =
  /\.claude\/(hooks\b|settings(\.local)?\.json|loop\.active|guard\.unlock)|\.claude\/?(\*|\s|$)|(^|[\s=])(settings(\.local)?\.json|loop\.active|guard\.unlock)\b|agent-guard/;
// `cd` a un destino no verificable (variable, `~`): el `hooks/` relativo podría ser el del guard.
const CD_DYNAMIC = /(^|[\s;&|(])(cd|pushd|chdir|set-location|sl)\s+[^;&|\n]*[$%`~]/;
const P_SENTINELS = /loop\.active|guard\.unlock|\.claude\/?(\*|\s|$)/;
const WRITE_VERBS =
  /\b(rm|rmdir|mv|cp|tee|truncate|chmod|chown|ln|touch|install|dd|unlink|new-item|remove-item|set-content|add-content|out-file|copy-item|move-item|rename-item|ni|ri|del|erase|move|copy|ren)\b|\bsed\b[^;&|\n]*\s(-\w*i|--in-place)|\bperl\b[^;&|\n]*\s-\w*i|\bgit\b[^;&|\n]*\b(checkout|restore|rm|mv|apply|stash|reset|am)\b/;
const INTERP_WRITE =
  /\b(node|python3?|py|perl|ruby|deno|bun|pwsh|powershell)\b[\s\S]*(writefile|appendfile|unlink|rmsync|rmdir|rename|copyfile|createwritestream|open\(|set-content|out-file|shutil|os\.remove|write_text|write_bytes)/;

function shellWritesProtected(flat, unlocked, cwdInClaude) {
  const bareHooks = cwdInClaude || /\.claude/.test(flat) || CD_DYNAMIC.test(flat);
  const P = unlocked ? P_SENTINELS : bareHooks ? P_ALL : P_NO_BARE_HOOKS;
  // Redirecciones: el destino de `>`/`>>` es protegido (`2>&1` no cuenta).
  const redirect = /(^|[^0-9&])\d?>{1,2}\|?\s*([^\s;&|<>]+)/g;
  let m;
  while ((m = redirect.exec(flat))) {
    const target = m[2];
    if (target.startsWith('&')) continue;
    if (P.test(` ${target} `)) return true;
    if (cwdInClaude && !target.startsWith('/') && !/^[a-z]:\//.test(target)) return true;
  }
  const mentions = P.test(flat);
  if ((mentions || cwdInClaude) && WRITE_VERBS.test(flat)) return true;
  if (mentions && INTERP_WRITE.test(flat)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Tabla de reglas
// ---------------------------------------------------------------------------

/**
 * Cada regla: id, descripción, `restrictedOnly` y `match(ctx)` que devuelve el
 * motivo (string) si bloquea o null. `ctx` = { input, env, restricted }.
 */
export const RULES = [
  {
    id: 'main-branch',
    description:
      'Siempre: no editar archivos del repo mientras la rama actual es main (o no se puede resolver).',
    restrictedOnly: false,
    match({ input, env }) {
      if (!EDIT_TOOLS.has(input.tool_name)) return null;
      const fp = editPath(input);
      if (!fp) return null;
      const abs = normalizePath(fp, input.cwd || env.projectDir);
      const inProject = relToProject(abs, env.projectDir) !== null;
      // Mismo alcance que el guard inline anterior: cualquier ruta bajo
      // "Proyectos VS CODE/…SecondMind…" (incluye worktrees hermanos).
      const legacyScope = /proyectos vs code\/.*secondmind/.test(abs);
      if (!inProject && !legacyScope) return null;
      const branch = env.getBranch(abs);
      if (!branch)
        return 'no se pudo resolver la rama del repo (bloqueado por seguridad); creá una rama feat/<x>';
      if (branch === 'main')
        return 'la rama actual es main; creá una rama feat/<x> antes de editar';
      return null;
    },
  },
  {
    id: 'protected-path',
    description:
      'Restringido: no editar el guard, los settings de Claude Code ni los sentinels del loop.',
    restrictedOnly: true,
    match({ input, env }) {
      if (!EDIT_TOOLS.has(input.tool_name)) return null;
      const fp = editPath(input);
      if (!fp) return null;
      const kind = protectedKind(normalizePath(fp, input.cwd || env.projectDir), env.projectDir);
      if (kind === 'sentinel')
        return `${fp} es un sentinel del loop (nunca escribible por agentes)`;
      // guard.unlock = ventana de mantenimiento abierta a propósito por el orquestador.
      if (kind === 'config' && !env.unlocked) return `${fp} es una ruta protegida del guard`;
      return null;
    },
  },
  {
    id: 'mcp-firebase',
    description:
      'Restringido: ninguna tool MCP de Firebase (ni lecturas): los agentes no tocan el proyecto real.',
    restrictedOnly: true,
    match({ input }) {
      return /^mcp__.*firebase/i.test(input.tool_name ?? '')
        ? `${input.tool_name} (MCP de Firebase)`
        : null;
    },
  },
  {
    id: 'mcp-browser',
    description:
      'Restringido: el navegador MCP (Playwright) solo abre la app del emulador (:5180) o la landing (:4321); run_code bloqueado.',
    restrictedOnly: true,
    match({ input }) {
      if (!/^mcp__.*playwright/i.test(input.tool_name ?? '')) return null;
      // run_code ejecuta JS arbitrario en el proceso del server MCP (vm con el `process`
      // real): puede correr comandos sin pasar por el hook de Bash. Su `filename` además
      // carga el código desde un archivo que el guard no lee. Se bloquea entero.
      if (/run_?code/i.test(input.tool_name))
        return `${input.tool_name} (ejecuta código arbitrario en el proceso del server MCP)`;
      const text = JSON.stringify(input.tool_input ?? {});
      if (PROD_REFS.test(text)) return `${input.tool_name} con una referencia a producción`;
      // navigate/tabs: el destino es exactamente la app local (data:/file:/javascript: no tienen `://`).
      const dest = input.tool_input?.url;
      if (typeof dest === 'string' && dest !== 'about:blank' && !LOCAL_APP.test(dest))
        return `${input.tool_name} a ${dest} (solo localhost:5180 o :4321; usá npm run dev:emu)`;
      // Tools de texto (teclean, eligen o verifican texto; no navegan ni hacen requests): una
      // URL en el texto es dato. Solo cuentan las referencias a producción (arriba).
      const tool = input.tool_name.split('__').pop().toLowerCase();
      if (BROWSER_TEXT_TOOLS.has(tool)) return null;
      // evaluate corre en la página de la app: además puede hablar con los emuladores.
      const ok = (u) => LOCAL_APP.test(u) || (tool === 'browser_evaluate' && EMULATOR.test(u));
      for (const url of text.match(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`)\\]+/gi) ?? []) {
        if (!ok(url))
          return `${input.tool_name} a ${url} (solo localhost:5180 o :4321; usá npm run dev:emu)`;
      }
      return null;
    },
  },
  {
    id: 'shell',
    description:
      'Restringido: comandos de shell que publican, deployan, reescriben historia o tocan rutas protegidas.',
    restrictedOnly: true,
    match({ input, env }) {
      if (!SHELL_TOOLS.has(input.tool_name)) return null;
      const cmd = input.tool_input?.command;
      if (typeof cmd !== 'string') return 'comando ilegible';
      return checkShell(cmd, env, input.cwd);
    },
  },
];

const LOCAL_APP = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):(5180|4321)(\/|\?|#|$)/i;
// Puertos de emulador de `firebase.json` (auth 9099, firestore 8080, functions 5001). No
// define `ui`, así que el puerto de la UI del emulador (4000 por defecto) no se permite.
const EMULATOR = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):(9099|8080|5001)(\/|\?|#|$)/i;
// Tools de Playwright MCP (0.0.83) que solo teclean, eligen o verifican texto.
const BROWSER_TEXT_TOOLS = new Set([
  'browser_type',
  'browser_fill_form',
  'browser_select_option',
  'browser_press_key',
  'browser_press_sequentially',
  'browser_keydown',
  'browser_keyup',
  'browser_handle_dialog',
  'browser_wait_for',
  'browser_find',
  'browser_verify_text_visible',
  'browser_verify_value',
  'browser_verify_element_visible',
  'browser_verify_list_visible',
]);

function editPath(input) {
  const ti = input.tool_input ?? {};
  return ti.file_path ?? ti.notebook_path ?? null;
}

// --- Scripts de package managers (`npm run x` ejecuta el cuerpo de x) -------

const MAX_SCRIPT_DEPTH = 5;
const PM = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const NPM_RUN = new Set(['run', 'run-script', 'rum', 'urn']);
const NPM_LIFECYCLE = {
  start: ['start'],
  test: ['test'],
  t: ['test'],
  tst: ['test'],
  stop: ['stop'],
  restart: ['restart', 'stop', 'start'],
  install: ['preinstall', 'install', 'postinstall', 'prepare'],
  i: ['preinstall', 'install', 'postinstall', 'prepare'],
  ci: ['preinstall', 'install', 'postinstall', 'prepare'],
  add: ['preinstall', 'install', 'postinstall', 'prepare'],
  rebuild: ['preinstall', 'install', 'postinstall', 'prepare'],
};
const DYNAMIC_WORD = /[$%`~]/;

/**
 * Qué scripts de package.json corre un `npm|pnpm|yarn|bun …`: { dir, names }
 * o { unverifiable: motivo } o null si no corre ninguno.
 */
function pmScripts(name, args) {
  let dir = null;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--') break;
    const eq = t.match(/^(--[a-z-]+)=(.*)$/);
    if (eq) {
      if (['--prefix', '--dir', '--cwd'].includes(eq[1])) dir = eq[2];
      if (['--workspace', '--filter'].includes(eq[1]))
        return { unverifiable: `${name} ${eq[1]} (scripts de otros paquetes)` };
      continue;
    }
    if (['--prefix', '-C', '--dir', '--cwd'].includes(t)) {
      dir = args[++i] ?? '';
      continue;
    }
    if (
      ['--workspace', '-w', '--workspaces', '-ws', '--filter', '-F', '-r', '--recursive'].includes(
        t,
      )
    )
      return { unverifiable: `${name} ${t} (scripts de otros paquetes)` };
    if (t.startsWith('-')) continue;
    positional.push(t);
  }
  const [sub, arg] = positional;
  if (!sub) return null;
  let names;
  if (NPM_RUN.has(sub)) names = arg ? [arg] : [];
  else if (NPM_LIFECYCLE[sub]) names = NPM_LIFECYCLE[sub];
  else if (name !== 'npm') names = [sub]; // `yarn x`, `pnpm x`, `bun x` corren el script x
  else return null;
  if (!names.length) return null;
  if (names.some((s) => DYNAMIC_WORD.test(s)) || (dir !== null && DYNAMIC_WORD.test(dir)))
    return { unverifiable: `${name} con script o directorio dado por variable` };
  const all = new Set();
  for (const s of names) for (const x of [`pre${s}`, s, `post${s}`]) all.add(x);
  return { dir, names: [...all] };
}

/** Resuelve el package.json (el de `dir` o el más cercano subiendo desde cwd). */
function findScripts(env, base, dir) {
  if (dir !== null) {
    const d = normalizePath(dir, base);
    return { dir: d, scripts: env.readScripts(d) };
  }
  let d = base;
  for (let k = 0; k < 40 && d; k++) {
    const scripts = env.readScripts(d);
    if (scripts) return { dir: d, scripts };
    const parent = d.replace(/\/[^/]*$/, '');
    if (parent === d || !parent.includes('/')) break;
    d = parent;
  }
  return { dir: base, scripts: null };
}

function checkScripts(name, args, env, cwd, depth) {
  const target = pmScripts(name, args);
  if (!target) return null;
  if (target.unverifiable) return `[npm-script] ${target.unverifiable} (no verificable)`;
  if (cwd === null) return `[npm-script] ${name} tras un cd no verificable`;
  if (typeof env.readScripts !== 'function')
    return `[npm-script] ${name}: no hay lector de package.json (no verificable)`;
  if (depth >= MAX_SCRIPT_DEPTH)
    return `[npm-script] scripts anidados más de ${MAX_SCRIPT_DEPTH} niveles (no verificable)`;
  let found;
  try {
    found = findScripts(env, cwd, target.dir);
  } catch (err) {
    return `[npm-script] package.json ilegible (${err instanceof Error ? err.message : err})`;
  }
  if (!found.scripts) return null;
  for (const s of target.names) {
    const body = found.scripts[s];
    if (typeof body !== 'string') continue;
    const why = checkShell(body, env, found.dir, depth + 1);
    if (why) return `[npm-script] script "${s}" (${found.dir}) → ${why}`;
  }
  return null;
}

/**
 * `yarn <bin>`, `yarn run <bin>` y `pnpm <bin>`: si el nombre no es un script, el package
 * manager corre el binario de node_modules/.bin. Se aplica la regla de ese programa.
 */
function pmBin(name, args) {
  if (name !== 'yarn' && name !== 'pnpm') return null;
  let k = args.findIndex((t) => !t.startsWith('-'));
  if (k >= 0 && name === 'yarn' && args[k] === 'run') k++;
  if (k < 0 || k >= args.length) return null;
  const bin = programName(args[k]);
  if (PM.has(bin) || !PROGRAM_RULES[bin]) return null;
  return PROGRAM_RULES[bin](args.slice(k + 1), bin);
}

// --- Patrones de búsqueda (grep/rg/findstr/Select-String) ------------------

const SEARCH = new Set([
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'ack',
  'findstr',
  'select-string',
  'sls',
]);

/**
 * Blanquea en `cmd` los argumentos con comillas de un comando de búsqueda de
 * nivel superior, para que la red cruda no tome `grep "git push"` como un push,
 * y el valor de `git log --grep/-S/-G` (con o sin comillas). No toca destinos de
 * redirección ni tokens con `$(…)`/backticks.
 */
function maskSearchPatterns(cmd, cmds) {
  const chars = cmd.split('');
  const blank = (argv, k) => {
    const sp = argv.spans[k];
    if (!sp || sp.redirect || /\$\(|`/.test(argv[k])) return;
    for (let x = sp.start; x < sp.end; x++) if (chars[x] !== '\n') chars[x] = ' ';
  };
  for (const argv of cmds) {
    if (!argv.spans) continue;
    const [name, args] = resolveProgram(argv);
    const git = name === 'git' ? parseGit(args) : null;
    // `git log --grep X`, `--grep=X`, `-S X`/`-SX`, `-G X`/`-GX`: el valor es un patrón de
    // búsqueda (con o sin comillas); se blanquea solo ese valor.
    if (git && git.sub === 'log') {
      const from = argv.length - git.rest.length;
      for (let k = from; k < argv.length; k++) {
        const t = argv[k];
        if (t === '--grep' || t === '-S' || t === '-G') blank(argv, ++k);
        else if (t.startsWith('--grep=') || /^-[SG]./.test(t)) blank(argv, k);
      }
      continue;
    }
    const isGitGrep = git !== null && git.sub === 'grep';
    if (!SEARCH.has(name) && !isGitGrep) continue;
    const from = argv.length - args.length;
    for (let k = from; k < argv.length; k++) if (argv.spans[k]?.quoted) blank(argv, k);
  }
  return chars.join('');
}

// --- Archivos .env* --------------------------------------------------------

const ENV_FILE = /(^|[\s/=:,(])\.env/;
const DELETE_VERBS =
  /\b(rm|mv|unlink|rmdir|shred|del|erase|move|ren|rename|remove-item|ri|move-item|mi|rename-item|rni)\b|\s-delete\b/;

/**
 * ¿Un argv que empieza con `$x` ejecuta un programa dado por variable? En shell sí.
 * En modo 'code' (literales de `node -e`, tokens de un comando con heredoc) es texto:
 * `$f`/`$1` de un script no se ejecutan, y una ejecución real por variable
 * (`execSync(cmd)`) igual no sería verificable. En PowerShell `$x …` es una expresión
 * (`foreach($p in …)`, `% { $_.Id }`); solo invoca con `& $x` / `. $x`.
 */
function dynamicProgram(argv) {
  if (argv.mode === 'code') return false;
  if (argv.mode === 'ps') return Boolean(argv.psCall);
  return true;
}

/** Devuelve "[regla] motivo" si el comando debe bloquearse, si no null. */
export function checkShell(cmd, env, cwd, depth = 0) {
  const cmds = splitCommands(cmd);
  // cwd efectivo para resolver `npm run`: sigue los `cd`; null = no verificable.
  let cur = normalizePath(cwd || env.projectDir);
  for (const argv of cmds) {
    const [name, args, tok] = resolveProgram(argv);
    if (!name) continue;
    if (/^\$/.test(tok) && dynamicProgram(argv))
      return '[dynamic] programa dado por una variable (no verificable)';
    const rule = PROGRAM_RULES[name];
    const hit = (rule ? rule(args, name) : null) ?? pmBin(name, args);
    if (hit) return `[${hit[0]}] ${hit[1]}`;
    if (['cd', 'pushd', 'chdir', 'set-location', 'sl'].includes(name)) {
      const dests = args.filter((t) => !t.startsWith('-') && !/^\/d$/i.test(t));
      const d = dests[0];
      cur = !d || DYNAMIC_WORD.test(d) || cur === null ? null : normalizePath(d, cur);
    }
    if (PM.has(name)) {
      const why = checkScripts(name, args, env, cur, depth);
      if (why) return why;
    }
  }
  const flat = maskSearchPatterns(cmd, cmds)
    .replace(/\\/g, '/')
    .replace(/["'`]/g, '')
    .toLowerCase();
  const net = rawNet(flat);
  if (net) return `[${net[0]}] ${net[1]}`;
  if (ENV_FILE.test(flat) && DELETE_VERBS.test(flat))
    return '[env-file] borrar o mover archivos .env* desde la shell';
  const root = normalizePath(env.projectDir);
  const cwdN = cwd ? normalizePath(cwd) : '';
  const cwdInClaude =
    Boolean(root) && (cwdN === `${root}/.claude` || cwdN.startsWith(`${root}/.claude/`));
  if (shellWritesProtected(flat, env.unlocked, cwdInClaude))
    return '[protected-path] escritura a una ruta protegida del guard desde la shell';
  return null;
}

/**
 * Decide sobre una llamada a tool. `env`:
 *   projectDir  raíz del proyecto (CLAUDE_PROJECT_DIR)
 *   loopActive  existe `.claude/loop.active`
 *   unlocked    existe `.claude/guard.unlock`
 *   getBranch   (rutaAbsNormalizada) => nombre de rama | null
 *   readScripts (dirNormalizado) => scripts del package.json | null (lanza si es ilegible)
 * Devuelve { block: boolean, rule?, reason? }.
 */
export function evaluate(input, env) {
  if (isLoopClose(input, env)) return { block: false };
  const restricted = isRestricted(input, env);
  for (const rule of RULES) {
    if (rule.restrictedOnly && !restricted) continue;
    const why = rule.match({ input, env, restricted });
    if (why) {
      const tail = rule.restrictedOnly ? `; ${STOP}` : '';
      return { block: true, rule: rule.id, reason: `agent-guard [${rule.id}]: ${why}${tail}.` };
    }
  }
  return { block: false };
}

const RM_PROGRAMS = new Set(['rm', 'del', 'erase', 'remove-item', 'ri']);

/**
 * Cierre del loop: la sesión principal (nunca un subagente) borra `.claude/loop.active`
 * con un comando suelto y literal (`rm [-f] <ruta>`, `Remove-Item <ruta>`), sin nada
 * más en la línea. Así el orquestador cierra la etapa sin que Sebastián intervenga;
 * un subagente sigue sin poder salir del modo restringido.
 */
export function isLoopClose(input, env) {
  if (!input || input.agent_id || !env.loopActive || !SHELL_TOOLS.has(input.tool_name))
    return false;
  const cmd = input.tool_input?.command;
  if (typeof cmd !== 'string' || /[;&|<>`$\n\r()*?]/.test(cmd.trim())) return false;
  // Sin metacaracteres, `\` solo puede ser separador de ruta de Windows.
  const cmds = splitCommands(cmd.trim().replace(/\\/g, '/'));
  if (cmds.length !== 1) return false;
  const [prog, ...args] = cmds[0];
  if (!RM_PROGRAMS.has(programName(prog))) return false;
  const paths = args.filter((t) => !/^-(f|force)$/i.test(t));
  if (paths.length !== 1 || paths[0].startsWith('-')) return false;
  const root = normalizePath(env.projectDir);
  return (
    Boolean(root) &&
    normalizePath(paths[0], input.cwd || env.projectDir) === `${root}/.claude/loop.active`
  );
}

/** Modo restringido: la llamada viene de un subagente o el loop está activo. */
export function isRestricted(input, env) {
  return Boolean(input && input.agent_id) || Boolean(env.loopActive);
}
