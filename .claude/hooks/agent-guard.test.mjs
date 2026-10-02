// Tests del agent-guard (SPEC-69 T2). Cada regla tiene un caso bloqueado en
// modo restringido (control positivo) y su contraparte permitida.
// Correr: npm run test:guard

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, splitCommands, normalizePath } from './agent-guard-lib.mjs';

const PROJECT = 'D:/Proyectos VS CODE/SecondMind';
const HERE = path.dirname(fileURLToPath(import.meta.url));

function env(over = {}) {
  return {
    projectDir: PROJECT,
    loopActive: false,
    unlocked: false,
    getBranch: () => 'feat/x',
    ...over,
  };
}

const SUB = { agent_id: 'agent-123', agent_type: 'tanda-writer' };

function bash(command, extra = {}) {
  return { tool_name: 'Bash', tool_input: { command }, cwd: PROJECT, ...extra };
}
function edit(file_path, extra = {}, tool = 'Edit') {
  const key = tool === 'NotebookEdit' ? 'notebook_path' : 'file_path';
  return { tool_name: tool, tool_input: { [key]: file_path }, cwd: PROJECT, ...extra };
}

/** Afirma bloqueo en modo subagente y devuelve la regla. */
function blocked(input, e = env()) {
  const r = evaluate({ ...input, ...SUB }, e);
  assert.equal(r.block, true, `debería bloquear: ${JSON.stringify(input.tool_input)}`);
  return r;
}
function allowedSub(input, e = env()) {
  const r = evaluate({ ...input, ...SUB }, e);
  assert.equal(
    r.block,
    false,
    `debería permitir (subagente): ${JSON.stringify(input.tool_input)} → ${r.reason}`,
  );
}
function allowedMain(input, e = env()) {
  const r = evaluate(input, e);
  assert.equal(
    r.block,
    false,
    `debería permitir (sesión principal): ${JSON.stringify(input.tool_input)} → ${r.reason}`,
  );
}

describe('modo restringido', () => {
  test('subagente → restringido; sesión principal sin sentinel → libre; con loop.active → restringido', () => {
    assert.equal(evaluate({ ...bash('git push'), ...SUB }, env()).block, true);
    assert.equal(evaluate(bash('git push'), env()).block, false);
    assert.equal(evaluate(bash('git push'), env({ loopActive: true })).block, true);
  });
  test('el motivo pide detenerse y reportar', () => {
    const r = blocked(bash('git push'));
    assert.match(r.reason, /detenete y reportá al orquestador/);
    assert.match(r.reason, /git-push/);
  });
});

describe('git push', () => {
  const casos = [
    'git push',
    'git push --dry-run origin HEAD',
    'git -C "D:/x" push origin main',
    'git --git-dir=.git --work-tree=. push',
    'git -c core.x=y push',
    'npm test && git push',
    'npm test || git push',
    'npm test; git push',
    'echo hi | git push',
    'npm test\ngit push',
    'bash -c "git push"',
    "sh -c 'git push origin HEAD'",
    'powershell -Command "git push"',
    'cmd /c "git push"',
    'echo $(git push)',
    'echo "$(git push)"',
    'echo `git push`',
    '/usr/bin/git push',
    'C:\\Program Files\\Git\\bin\\git.exe push',
    'git.exe push',
    'GIT_TRACE=1 git push',
    'sudo git push',
    'xargs -n1 git push',
    'git send-pack origin',
    'g\\it push',
    'git "push"',
    "node -e \"require('child_process').execSync('git push')\"",
  ];
  for (const c of casos)
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /git-push/));
  test('permitido a la sesión principal (I4)', () => allowedMain(bash('git push origin HEAD')));
  test('permitido al subagente: git status / log / commit -F', () => {
    allowedSub(bash('git status'));
    allowedSub(bash('git log --oneline -5'));
    allowedSub(bash('git add .claude/hooks/agent-guard.mjs && git commit -F msg.txt'));
  });
});

describe('git tag', () => {
  for (const c of [
    'git tag v0.7.0',
    'git tag -a v0.7.0 -m "release"',
    'git tag -d e0-T1',
    'git tag --delete e0-T1',
    'git tag -f e0-T2',
    'git tag -fa e0-T2 -m x',
    'git tag otro',
    'git tag -m "a e0-T1" v1',
    'git tag -a -m "x y" v1',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /git-tag/));
  }
  for (const c of [
    'git tag',
    'git tag -l',
    'git tag -l "e0-*"',
    'git tag --list',
    'git tag --contains HEAD',
    'git tag --points-at HEAD',
    'git tag e0-T2',
    'git tag e12-T3b',
    'git tag -a e0-T2 -m "cierre de tanda"',
    'git tag e0-T2 HEAD~1',
    'git tag -n',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('sesión principal puede crear v* (release fuera del loop)', () =>
    allowedMain(bash('git tag v0.7.0')));
});

describe('historia de git', () => {
  for (const c of [
    'git merge feat/x',
    'git rebase main',
    'git checkout main',
    'git switch main',
    'git checkout -B main',
    'git branch -f main HEAD',
    'git branch -D main',
    'git branch -M otra',
    'git update-ref refs/heads/main HEAD',
    'git reset --hard HEAD~1',
    'git -c alias.p=push p',
    'git config alias.p push',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /git-(history|alias)/));
  }
  for (const c of [
    'git checkout -b feat/y',
    'git switch feat/x',
    'git branch -d feat/vieja',
    'git reset --soft HEAD~1',
    'git merge-base main HEAD',
    'git diff main...HEAD',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('sesión principal puede mergear', () => allowedMain(bash('git merge --no-ff feat/x')));
});

describe('gh', () => {
  for (const c of [
    'gh release create v1',
    'gh pr merge 3',
    'gh pr create --fill',
    'gh workflow run release.yml',
    'gh run rerun 123',
    'gh api -X POST repos/x/y/issues',
    'gh api --method DELETE repos/x',
    'gh api repos/x/issues -f title=t',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /\[gh\]/));
  }
  for (const c of ['gh pr view 3', 'gh run list', 'gh api repos/x/y', 'gh api -X GET repos/x/y']) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('sesión principal puede publicar release', () => allowedMain(bash('gh release create v1')));
});

describe('firebase', () => {
  for (const c of [
    'firebase deploy',
    'firebase deploy --project demo-secondmind',
    'npx firebase deploy --only hosting:app',
    'npx firebase-tools deploy',
    'node node_modules/firebase-tools/lib/bin/firebase.js deploy',
    'firebase functions:log',
    'firebase firestore:get x',
    'firebase firestore:get x --project secondmindv1',
    'firebase --project=secondmindv1 emulators:start',
    'firebase emulators:start',
    'firebase firestore:delete -r users --project demo-x',
    'firebase auth:import users.json --project demo-x',
    'firebase hosting:disable --project demo-x',
    'firebase use secondmindv1',
    'npm test && firebase deploy',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /\[firebase\]/));
  }
  for (const c of [
    'firebase emulators:exec --project demo-secondmind "vitest run"',
    'firebase emulators:exec --project=demo-secondmind --only firestore "vitest run --config vitest.rules.config.ts"',
    'firebase firestore:get x --project demo-secondmind',
    'cat firebase.json',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('emulators:exec con un firebase deploy anidado se bloquea', () => {
    assert.match(
      blocked(bash('firebase emulators:exec --project demo-x "firebase deploy"')).reason,
      /\[firebase\]/,
    );
  });
  test('sesión principal puede deployar', () =>
    allowedMain(bash('firebase deploy --only hosting:app')));
});

describe('gcloud y HTTP a prod', () => {
  for (const c of [
    'gcloud firestore export gs://x',
    'gcloud auth list',
    'gsutil ls',
    'curl -s "https://firestore.googleapis.com/v1/projects/x"',
    'wget https://x.cloudfunctions.net/f',
    'curl https://example.com/secondmindv1',
    'Invoke-WebRequest -Uri https://firestore.googleapis.com/v1',
  ]) {
    test(`bloquea: ${c}`, () =>
      assert.match(blocked(bash(c)).reason, /\[(gcloud|http-prod|firebase)\]/));
  }
  for (const c of [
    'curl -s http://localhost:5173/',
    'curl -s http://127.0.0.1:8080/emulator/v1/projects/demo-x',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('sesión principal puede usar gcloud', () => allowedMain(bash('gcloud auth list')));
});

describe('scripts de deploy / release / nativos', () => {
  for (const c of [
    'npm run deploy',
    'npm run deploy:functions',
    'npm run deploy:landing',
    'npm --prefix src/functions run deploy',
    'npm run cap:sync',
    'npm run cap:build',
    'npm run tauri:build',
    'npm run release',
    'pnpm deploy',
    'yarn release:x',
    'npx cap sync android',
    'npx tauri build',
    'cd android && ./gradlew.bat assembleRelease',
    './gradlew bundleRelease',
    'npm publish',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /\[scripts-prod\]/));
  }
  for (const c of [
    'npm test',
    'npm run lint',
    'npm run build',
    'npm run test:rules',
    'npm run test:guard',
    'npm run tauri:dev',
    'cd android && ./gradlew.bat assembleDebug',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('sesión principal puede correr deploy', () => allowedMain(bash('npm run deploy')));
});

describe('rutas protegidas desde la shell', () => {
  for (const c of [
    'echo {} > .claude/settings.json',
    'echo x >> .claude\\hooks\\agent-guard.mjs',
    'rm .claude/loop.active',
    'rm -rf .claude/hooks',
    'mv .claude/settings.json /tmp/s',
    'cp /tmp/x .claude/hooks/agent-guard-lib.mjs',
    'touch .claude/guard.unlock',
    'cat x | tee .claude/settings.local.json',
    "sed -i 's/a/b/' .claude/settings.json",
    'git checkout -- .claude/hooks/agent-guard.mjs',
    'git restore .claude/settings.json',
    'Remove-Item .claude\\loop.active',
    'Set-Content -Path .claude/settings.json -Value x',
    "node -e \"require('fs').writeFileSync('.claude/settings.json', '{}')\"",
    'echo x > C:/Users/sebas/.claude/settings.json',
    'rm -rf .claude',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /protected-path/));
  }
  test('cwd dentro de .claude + escritura relativa → bloquea', () => {
    assert.match(
      blocked(bash('rm settings.json', { cwd: `${PROJECT}/.claude` })).reason,
      /protected-path/,
    );
  });
  for (const c of [
    'cat .claude/settings.json',
    'jq . .claude/settings.json',
    'node --test .claude/hooks/ 2>&1',
    'git add .claude/hooks/agent-guard.mjs',
    'git diff e0-T1..HEAD -- .claude/hooks',
    'rm src/hooks/useFoo.ts',
    'echo x > /tmp/out.txt',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('con guard.unlock se puede escribir settings pero no los sentinels', () => {
    const e = env({ unlocked: true });
    allowedSub(bash('echo {} > .claude/settings.json'), e);
    assert.match(blocked(bash('rm .claude/loop.active'), e).reason, /protected-path/);
    assert.match(blocked(bash('rm .claude/guard.unlock'), e).reason, /protected-path/);
  });
  test('sesión principal fuera del loop puede escribirlas', () =>
    allowedMain(bash('rm .claude/loop.active')));
});

describe('Edit/Write/MultiEdit/NotebookEdit sobre rutas protegidas', () => {
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
    test(`${tool}: bloquea hooks/settings/sentinels`, () => {
      for (const p of [
        `${PROJECT}/.claude/hooks/agent-guard.mjs`,
        'D:\\Proyectos VS CODE\\SecondMind\\.claude\\settings.json',
        'd:/proyectos vs code/secondmind/.CLAUDE/Settings.Local.json',
        '/d/Proyectos VS CODE/SecondMind/.claude/loop.active',
        '.claude/guard.unlock',
        `${PROJECT}/src/../.claude/hooks/x.mjs`,
        'C:\\Users\\sebas\\.claude\\settings.json',
      ]) {
        assert.match(blocked(edit(p, {}, tool)).reason, /protected-path/, p);
      }
    });
  }
  test('permite archivos normales al subagente', () => {
    allowedSub(edit(`${PROJECT}/src/lib/firebase.ts`));
    allowedSub(
      edit(`${PROJECT}/Spec/features/SPEC-feature-69-etapa0-trabajo-autonomo.md`, {}, 'Write'),
    );
    allowedSub(edit(`${PROJECT}/.claude/agents/tanda-writer.md`, {}, 'MultiEdit'));
  });
  test('guard.unlock abre hooks/settings pero nunca los sentinels', () => {
    const e = env({ unlocked: true });
    allowedSub(edit(`${PROJECT}/.claude/hooks/agent-guard.mjs`), e);
    allowedSub(edit(`${PROJECT}/.claude/settings.json`), e);
    assert.match(blocked(edit(`${PROJECT}/.claude/guard.unlock`), e).reason, /protected-path/);
    assert.match(blocked(edit(`${PROJECT}/.claude/loop.active`), e).reason, /protected-path/);
  });
  test('sesión principal fuera del loop puede editar settings', () =>
    allowedMain(edit(`${PROJECT}/.claude/settings.json`)));
});

describe('MCP de Firebase', () => {
  for (const t of [
    'mcp__firebase__firestore_get_document',
    'mcp__firebase__firestore_delete_document',
    'mcp__plugin_firebase_firebase__firestore_list_collections',
    'MCP__Firebase__x',
  ]) {
    test(`bloquea: ${t}`, () =>
      assert.match(blocked({ tool_name: t, tool_input: {} }).reason, /mcp-firebase/));
  }
  test('permite otras MCP al subagente', () =>
    allowedSub({ tool_name: 'mcp__playwright__browser_snapshot', tool_input: {} }));
  test('sesión principal puede usar el MCP de Firebase', () =>
    allowedMain({ tool_name: 'mcp__firebase__firestore_get_document', tool_input: {} }));
});

describe('main-branch (siempre, todos los modos)', () => {
  const onMain = env({ getBranch: () => 'main' });
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
    test(`${tool} en main: bloquea en sesión principal y subagente`, () => {
      const r = evaluate(edit(`${PROJECT}/src/x.ts`, {}, tool), onMain);
      assert.equal(r.block, true);
      assert.equal(r.rule, 'main-branch');
      assert.doesNotMatch(r.reason, /orquestador/);
      assert.equal(
        evaluate({ ...edit(`${PROJECT}/src/x.ts`, {}, tool), ...SUB }, onMain).block,
        true,
      );
    });
  }
  test('rama irresoluble → bloquea (semántica del guard inline anterior)', () => {
    assert.equal(evaluate(edit(`${PROJECT}/src/x.ts`), env({ getBranch: () => null })).block, true);
  });
  test('worktree hermano bajo "Proyectos VS CODE/…SecondMind…" también se cubre', () => {
    assert.equal(
      evaluate(edit('D:\\Proyectos VS CODE\\SecondMind-f3\\src\\x.ts'), onMain).block,
      true,
    );
  });
  test('rama feat → permite; archivos fuera del repo → permite aunque main', () => {
    allowedMain(edit(`${PROJECT}/src/x.ts`));
    allowedMain(edit('C:/Users/sebas/notas.md'), onMain);
  });
  test('Bash no lo dispara (igual que antes)', () => allowedMain(bash('git status'), onMain));
});

describe('helpers', () => {
  test('normalizePath', () => {
    assert.equal(normalizePath('/d/A/./b/../C'), 'd:/a/c');
    assert.equal(normalizePath('x\\y', 'D:\\P'), 'd:/p/x/y');
  });
  test('splitCommands separa operadores y anida strings', () => {
    const cmds = splitCommands('a && b "c d" ; bash -c "git push"');
    assert.ok(cmds.some((c) => c[0] === 'git' && c[1] === 'push'));
  });
});

// ---------------------------------------------------------------------------
// End-to-end: el script real, stdin JSON, CLAUDE_PROJECT_DIR temporal
// ---------------------------------------------------------------------------

describe('end-to-end (agent-guard.mjs)', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'agent-guard-'));
  const git = (...a) => execFileSync('git', ['-C', tmp, ...a], { stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  mkdirSync(path.join(tmp, '.claude'), { recursive: true });

  function run(payload) {
    const r = spawnSync(process.execPath, [path.join(HERE, 'agent-guard.mjs')], {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      encoding: 'utf8',
    });
    return r;
  }

  test('subagente git push → exit 2 con motivo; sesión principal → exit 0', () => {
    const b = run({
      tool_name: 'Bash',
      tool_input: { command: 'git push' },
      cwd: tmp,
      agent_id: 'a1',
    });
    assert.equal(b.status, 2);
    assert.match(b.stderr, /git-push/);
    assert.equal(
      run({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: tmp }).status,
      0,
    );
  });

  test('Write en main → exit 2; en rama feat → exit 0 (rama real del repo temporal)', () => {
    const w = {
      tool_name: 'Write',
      tool_input: { file_path: path.join(tmp, 'nuevo', 'dir', 'x.ts') },
      cwd: tmp,
    };
    assert.equal(run(w).status, 2);
    git('checkout', '-q', '-b', 'feat/x');
    try {
      assert.equal(run(w).status, 0);
    } finally {
      git('checkout', '-q', 'main');
    }
  });

  test('loop.active convierte a la sesión principal en restringida; stdin roto → fail-safe', () => {
    assert.equal(run('{no es json').status, 0);
    writeFileSync(path.join(tmp, '.claude', 'loop.active'), '');
    try {
      assert.equal(
        run({ tool_name: 'Bash', tool_input: { command: 'git tag v9.9.9' }, cwd: tmp }).status,
        2,
      );
      assert.equal(
        run({ tool_name: 'Bash', tool_input: { command: 'git tag -l' }, cwd: tmp }).status,
        0,
      );
      const broken = run('{no es json');
      assert.equal(broken.status, 2);
      assert.match(broken.stderr, /guard error, bloqueado por seguridad/);
    } finally {
      rmSync(path.join(tmp, '.claude', 'loop.active'));
    }
  });

  test('stdin roto de un subagente (agent_id en el texto) → exit 2', () => {
    assert.equal(run('{"agent_id":"a1", roto').status, 2);
  });

  after(() => rmSync(tmp, { recursive: true, force: true }));
});
