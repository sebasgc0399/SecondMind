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

/**
 * Parte un string de shell en comandos simples (arrays de argv). Respeta
 * comillas simples/dobles y escapes; corta en `;`, `&`, `|`, saltos de línea,
 * paréntesis, backticks y `$(`. Los tokens que contienen sintaxis de shell
 * (p.ej. el argumento de `bash -c "..."`, `powershell -Command "..."`, un
 * `$(...)` entre comillas o un heredoc) se vuelven a analizar como comandos.
 */
export function splitCommands(src, depth = 0) {
  const cmds = [];
  let argv = [];
  let tok = '';
  let has = false;
  const pushTok = () => {
    if (has) argv.push(tok);
    tok = '';
    has = false;
  };
  const endCmd = () => {
    pushTok();
    if (argv.length) cmds.push(argv);
    argv = [];
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
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
      endCmd();
      i += 2;
      continue;
    }
    if (';&|\n\r()`'.includes(c)) {
      endCmd();
      i++;
      continue;
    }
    if (c === '<' || c === '>') {
      pushTok();
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      pushTok();
      i++;
      continue;
    }
    tok += c;
    has = true;
    i++;
  }
  endCmd();
  if (depth >= 4) return cmds;
  const nested = [];
  for (const cmd of cmds) {
    for (const t of cmd) {
      if (NESTED.test(t)) nested.push(...splitCommands(t, depth + 1));
    }
  }
  return cmds.concat(nested);
}

/** Nombre de programa de un token: basename, sin extensión de ejecutable. */
export function programName(tok) {
  const base = String(tok).replace(/\\/g, '/').split('/').pop().toLowerCase();
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
    // `pnpm dlx x`, `yarn dlx x`, `npm exec x` → el programa es x
    if ((n === 'pnpm' || n === 'yarn') && argv[i + 1] === 'dlx') {
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

function rawNet(flat) {
  for (const [id, re, why] of RAW_NETS) if (re.test(flat)) return [id, why];
  if (
    /secondmindv1/.test(flat) &&
    /\b(firebase|gcloud|curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm)\b/.test(flat)
  ) {
    return ['firebase', 'comando con secondmindv1 (proyecto real)'];
  }
  return null;
}

// --- Escrituras a rutas protegidas desde la shell -------------------------

const P_ALL =
  /\.claude\/(hooks\b|settings(\.local)?\.json|loop\.active|guard\.unlock)|\.claude\/?(\*|\s|$)|(^|[\s=])(settings(\.local)?\.json|loop\.active|guard\.unlock)\b|agent-guard|(^|\s)hooks(\/|\s|$)/;
const P_SENTINELS = /loop\.active|guard\.unlock|\.claude\/?(\*|\s|$)/;
const WRITE_VERBS =
  /\b(rm|rmdir|mv|cp|tee|truncate|chmod|chown|ln|touch|install|dd|unlink|new-item|remove-item|set-content|add-content|out-file|copy-item|move-item|rename-item|ni|ri|del|erase|move|copy|ren)\b|\bsed\b[^;&|\n]*\s(-\w*i|--in-place)|\bperl\b[^;&|\n]*\s-\w*i|\bgit\b[^;&|\n]*\b(checkout|restore|rm|mv|apply|stash|reset|am)\b/;
const INTERP_WRITE =
  /\b(node|python3?|py|perl|ruby|deno|bun|pwsh|powershell)\b[\s\S]*(writefile|appendfile|unlink|rmsync|rmdir|rename|copyfile|createwritestream|open\(|set-content|out-file|shutil|os\.remove|write_text|write_bytes)/;

function shellWritesProtected(flat, unlocked, cwdInClaude) {
  const P = unlocked ? P_SENTINELS : P_ALL;
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

function editPath(input) {
  const ti = input.tool_input ?? {};
  return ti.file_path ?? ti.notebook_path ?? null;
}

/** Devuelve "[regla] motivo" si el comando debe bloquearse, si no null. */
export function checkShell(cmd, env, cwd) {
  for (const argv of splitCommands(cmd)) {
    const [name, args, tok] = resolveProgram(argv);
    if (!name) continue;
    if (/^\$/.test(tok)) return '[dynamic] programa dado por una variable (no verificable)';
    const rule = PROGRAM_RULES[name];
    const hit = rule ? rule(args, name) : null;
    if (hit) return `[${hit[0]}] ${hit[1]}`;
  }
  const flat = cmd.replace(/\\/g, '/').replace(/["'`]/g, '').toLowerCase();
  const net = rawNet(flat);
  if (net) return `[${net[0]}] ${net[1]}`;
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
 * Devuelve { block: boolean, rule?, reason? }.
 */
export function evaluate(input, env) {
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

/** Modo restringido: la llamada viene de un subagente o el loop está activo. */
export function isRestricted(input, env) {
  return Boolean(input && input.agent_id) || Boolean(env.loopActive);
}
