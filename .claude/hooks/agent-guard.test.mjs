// Tests del agent-guard (SPEC-69 T2). Cada regla tiene un caso bloqueado en
// modo restringido (control positivo) y su contraparte permitida.
// Correr: npm run test:guard

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, splitCommands, normalizePath } from './agent-guard-lib.mjs';

const PROJECT = 'D:/Proyectos VS CODE/SecondMind';
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Raíz real del repo (o del worktree) donde corre la suite: los scripts de
// npm se leen de los package.json reales, así test:rules/test:functions y
// src/functions `serve` se verifican tal como están hoy.
const REAL_ROOT = path.resolve(HERE, '..', '..');

/** Lee scripts reales mapeando PROJECT → REAL_ROOT. */
function realScripts(dir) {
  const p = normalizePath(PROJECT);
  const rel = dir === p ? '' : dir.startsWith(`${p}/`) ? dir.slice(p.length + 1) : null;
  if (rel === null) return null;
  const file = path.join(REAL_ROOT, rel, 'package.json');
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')).scripts ?? {};
}

/** Lector falso: { 'dir relativo a PROJECT': { script: cuerpo } }. */
function fakeScripts(map) {
  const p = normalizePath(PROJECT);
  return (dir) => {
    const rel = dir === p ? '' : dir.startsWith(`${p}/`) ? dir.slice(p.length + 1) : null;
    return rel !== null && map[rel] ? map[rel] : null;
  };
}

function env(over = {}) {
  return {
    projectDir: PROJECT,
    loopActive: false,
    unlocked: false,
    getBranch: () => 'feat/x',
    readScripts: realScripts,
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

describe('archivos ignorados y .env* (revisión T2, MAJOR 1)', () => {
  for (const c of [
    'git clean -fdX',
    'git clean -xdf',
    'git clean -x -f -d',
    'git clean --force -x',
    'git clean -X -n',
    'git -C . clean -fdx',
    'git stash -u',
    'git stash --include-untracked',
    'git stash -a',
    'git stash --all',
    'git stash push -u -m wip',
    'git stash save -a',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /git-ignored/));
  }
  for (const c of [
    'rm .env.local',
    'rm -f ./.env',
    'mv .env.local /tmp/x',
    'Remove-Item .env.local',
    'del .env',
    'git rm --cached .env.example',
    'find . -name ".env*" -delete',
    'rm -rf dist && rm .env.production',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /env-file/));
  }
  for (const c of [
    'git clean -fd',
    'git clean -n',
    'git stash',
    'git stash -m "wip"',
    'git stash pop',
    'git stash list',
    'rm src/env.ts',
    'node -e "console.log(process.env.HOME)"',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
});

describe('scripts de npm/pnpm/yarn (revisión T2, MAJOR 2)', () => {
  // Contra los package.json reales del repo.
  for (const c of [
    'npm --prefix src/functions run serve',
    'npm --prefix=src/functions run serve',
    'npm -C src/functions run serve',
    'npm run logs:functions',
    'npm --prefix src/functions run logs',
    'cd src/functions && npm run serve',
    'cd src/functions; npm run logs',
    'bash -c "cd src/functions && npm run serve"',
  ]) {
    test(`bloquea (package.json real): ${c}`, () =>
      assert.match(blocked(bash(c)).reason, /npm-script.*\[firebase\]/));
  }
  test('desde cwd = src/functions, `npm run serve` resuelve ese package.json', () =>
    assert.match(
      blocked(bash('npm run serve', { cwd: `${PROJECT}/src/functions` })).reason,
      /npm-script/,
    ));
  for (const c of [
    'npm run test:rules',
    'npm run test:functions',
    'npm run test:guard',
    'npm run lint',
    'npm run build',
    'npm test',
    'npm run build:landing',
    'npm --prefix src/functions run build',
    'npm run no-existe',
  ]) {
    test(`permite (package.json real): ${c}`, () => allowedSub(bash(c)));
  }

  const fake = env({
    readScripts: fakeScripts({
      '': {
        a: 'npm run b',
        b: 'npm run c',
        c: 'firebase emulators:start',
        hidden: 'echo ok',
        prehidden: 'git push',
        start: 'gh release create v1',
        t1: 'npm run t2',
        t2: 'npm run t3',
        t3: 'npm run t4',
        t4: 'npm run t5',
        t5: 'npm run t6',
        t6: 'echo fin',
        ok: 'vitest run',
        loop: 'npm run loop',
      },
      sub: { s: 'git checkout main' },
    }),
  });
  for (const [c, re] of [
    ['npm run a', /npm-script.*firebase/],
    ['yarn a', /npm-script.*firebase/],
    ['pnpm run a', /npm-script.*firebase/],
    ['npm run-script c', /npm-script/],
    ['npm run hidden', /npm-script.*prehidden.*git-push/],
    ['npm start', /npm-script.*\[gh\]/],
    ['npm --prefix sub run s', /npm-script.*git-history/],
    ['npm run t1', /npm-script.*más de 5 niveles/],
    ['npm run loop', /npm-script.*más de 5 niveles/],
    ['npm run $X', /npm-script.*variable/],
    ['cd $DIR && npm run ok', /npm-script.*cd no verificable/],
    ['npm -w pkg run ok', /npm-script.*otros paquetes/],
    ['pnpm -r run ok', /npm-script.*otros paquetes/],
  ]) {
    test(`bloquea (scripts falsos): ${c}`, () => assert.match(blocked(bash(c), fake).reason, re));
  }
  test('permite (scripts falsos): npm run ok, npm run t2 (5 niveles exactos)', () => {
    allowedSub(bash('npm run ok'), fake);
    allowedSub(bash('npm run t2'), fake);
  });
  test('package.json ilegible → bloquea; sin lector → bloquea', () => {
    const roto = env({
      readScripts: () => {
        throw new Error('Unexpected token');
      },
    });
    assert.match(blocked(bash('npm run x'), roto).reason, /ilegible/);
    assert.match(blocked(bash('npm run x'), env({ readScripts: undefined })).reason, /npm-script/);
  });
  test('la sesión principal sigue pudiendo correr cualquier script (I4)', () =>
    allowedMain(bash('npm run logs:functions')));
});

describe('refspecs y worktrees sobre main (revisión T2, MINOR 3)', () => {
  for (const c of [
    'git fetch . HEAD:main',
    'git fetch origin feat/x:main',
    'git fetch origin +HEAD:refs/heads/main',
    'git fetch . :main',
    'git worktree add ../wt main',
    'git worktree add -B main ../wt',
    'git worktree add ../wt refs/heads/main',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /git-history/));
  }
  test('bloquea: git push . x:main (push, cualquiera sea el refspec)', () =>
    assert.match(blocked(bash('git push . x:main')).reason, /git-push/));
  for (const c of [
    'git fetch origin',
    'git fetch origin main',
    'git fetch origin main:refs/remotes/origin/main',
    'git worktree add ../wt feat/x',
    'git worktree add -b feat/y ../wt',
    'git worktree list',
    'git show HEAD:src/main.tsx',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
});

describe('patrones de búsqueda vs strings ejecutables (revisión T2, MINOR 4)', () => {
  for (const c of [
    "grep -rn 'firebase\\|deploy' src",
    'rg "firebase|tauri" src',
    'rg -n "git push|firebase deploy" .claude/agents',
    "grep -rn 'git push' Spec/",
    'grep -rn "npm run deploy" Spec/ | head -5',
    'findstr /s /i "firebase deploy" *.md',
    'Select-String -Pattern "git checkout main" -Path Spec/*.md',
    "grep -rn 'rm -rf' .claude/hooks",
    'git grep -n "gcloud auth"',
    'git log --oneline | grep "merge|rebase"',
    'git commit -F msg.txt',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  for (const [c, re] of [
    ['bash -c "git checkout main"', /git-history/],
    ["sh -c 'firebase emulators:start'", /\[firebase\]/],
    ['bash -lc "gh pr merge 3"', /\[gh\]/],
    ['pwsh -Command "gh release create v1"', /\[gh\]/],
    ['powershell -NoProfile -c "git merge x"', /git-history/],
    ['cmd /c "git rebase main"', /git-history/],
    ['eval "git checkout main"', /dynamic/],
    ["node -e \"require('child_process').execSync('git checkout main')\"", /git-history/],
    ['python -c "import os; os.system(\'gh release create v1\')"', /\[gh\]/],
    ['echo "$(git checkout main)"', /git-history/],
    ['echo "`gh pr merge 1`"', /\[gh\]/],
    ['firebase emulators:exec --project demo-x "git checkout main"', /git-history/],
    ['npx -c "git checkout main"', /git-history/],
    ['grep x "$(git checkout main)"', /git-history/],
    ['grep "x" f > .claude/settings.json', /protected-path/],
    ['grep "x" f; echo "git push"', /git-push/],
    ['grep -rn "x" src && git push', /git-push/],
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, re));
  }
});

describe('controles positivos de ramas sin cobertura (revisión T2, NIT 5)', () => {
  test('cwd dentro de .claude: escritura relativa a un archivo NO protegido por nombre → bloquea', () => {
    const inClaude = { cwd: `${PROJECT}/.claude` };
    assert.match(blocked(bash('rm notas.txt', inClaude)).reason, /protected-path/);
    assert.match(blocked(bash('echo x > notas.txt', inClaude)).reason, /protected-path/);
    allowedSub(bash('rm notas.txt', { cwd: `${PROJECT}/src` }));
  });
  test('[dynamic]: programa dado por una variable', () => {
    assert.match(blocked(bash('$CMD --version')).reason, /\[dynamic\]/);
    assert.match(blocked(bash('"$TOOL" status')).reason, /\[dynamic\]/);
  });
  test('node como prefijo: firebase.js de firebase-tools sin proyecto demo → bloquea', () => {
    assert.match(
      blocked(bash('node node_modules/firebase-tools/lib/bin/firebase.js emulators:start')).reason,
      /\[firebase\]/,
    );
    allowedSub(
      bash('node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --project demo-x'),
    );
  });
  test('alias firebase-tools: npx firebase-tools sin proyecto demo → bloquea', () => {
    assert.match(blocked(bash('npx firebase-tools emulators:start')).reason, /\[firebase\]/);
    allowedSub(bash('npx firebase-tools emulators:start --project demo-x'));
  });
});

describe('app con config de producción (seguimiento E0-T7)', () => {
  for (const c of [
    'npm run dev',
    'npm run dev -- --port 5180',
    'npm run preview',
    'npm run tauri:dev',
    'vite',
    'npx vite --port 5180',
    'node node_modules/vite/bin/vite.js',
    'node node_modules/vite/bin/vite.js --mode production',
    'vite --mode=development',
    'vite preview --mode emulator',
    'npx tauri dev',
    'cargo tauri dev',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /\[dev-prod\]/));
  }
  test('bloquea vite --mode dado por una variable', () =>
    assert.match(blocked(bash('vite --mode $M')).reason, /\[dynamic\]/));
  for (const c of [
    'npm run dev:emu',
    'npm run dev:emu:app',
    'npm run e2e:ui',
    'vite --mode emulator --port 5180 --strictPort',
    'node node_modules/vite/bin/vite.js -m emulator',
    'node node_modules/vite/bin/vite.js build',
    'npx vite build --mode emulator',
    'npm run build',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('sesión principal puede correr npm run dev', () => allowedMain(bash('npm run dev')));
});

describe('vite: subcomando real, @versión y lanzadores (revisión pendientes, MINOR 2)', () => {
  for (const c of [
    'vite preview --outDir build',
    'vite --force build',
    'vite --host build',
    'vite dev build',
    'npx vite@8',
    'npx --yes vite@latest',
    'npx vite@8 --mode production',
    'pnpm exec vite',
    'pnpm vite',
    'yarn exec vite',
    'yarn vite',
    'yarn run vite',
    'node ./node_modules/vite/dist/node/cli.js',
    'node "D:\\x\\node_modules\\vite\\bin\\vite.js" --port 5180',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /\[dev-prod\]/));
  }
  for (const c of [
    'npx vite build',
    'vite build --outDir build',
    'vite -c vite.config.ts build',
    'vite --mode emulator build',
    'vite --port 5180 optimize',
    'npx vite@8 build',
    'pnpm exec vite build',
    'yarn vite build',
    'node ./node_modules/vite/dist/node/cli.js build',
    'npx vite@8 --mode emulator --port 5180',
    'npm run build',
    'npm run dev:emu',
    'npm run e2e:ui',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('programName quita @versión, también con scope', async () => {
    const { programName } = await import('./agent-guard-lib.mjs');
    assert.equal(programName('vite@8.0.8'), 'vite');
    assert.equal(programName('@scope/firebase-tools@15'), 'firebase');
    assert.equal(programName('@playwright/mcp@latest'), 'mcp');
    assert.equal(programName('git'), 'git');
  });
});

describe('referencias a producción en cualquier comando (seguimiento E0-T7)', () => {
  for (const c of [
    `node -e "fetch('https://firestore.googleapis.com/v1/projects/x/databases')"`,
    `python -c "import urllib.request as u; u.urlopen('https://x.cloudfunctions.net/f')"`,
    'node scripts/x.mjs --project secondmindv1',
    `node -e "fetch('https://secondmindv1-default-rtdb.firebaseio.com/.json')"`,
    'echo https://app.getsecondmind.co',
    "node <<'EOF'\nfetch('https://identitytoolkit.googleapis.com/v1/accounts')\nEOF",
  ]) {
    test(`bloquea: ${c.split('\n')[0]}`, () =>
      assert.match(blocked(bash(c)).reason, /\[http-prod\]/));
  }
  for (const c of [
    'rg "secondmindv1" src',
    'grep -rn "googleapis.com" src/lib',
    `node -e "fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-secondmind')"`,
    'node scripts/seed-emulator.mjs',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  test('sesión principal puede mencionar secondmindv1', () =>
    allowedMain(bash('node -e "console.log(1)" # secondmindv1')));
});

describe('git log --grep/-S/-G como patrón de búsqueda (revisión pendientes, MINOR 3)', () => {
  for (const c of [
    'git log --grep="secondmindv1"',
    'git log --grep secondmindv1 --oneline',
    "git log --oneline --grep='firestore.googleapis.com'",
    'git log -Ssecondmindv1',
    'git log -S "googleapis.com" --oneline -5',
    'git log -G cloudfunctions.net',
    '/usr/bin/git -C . log -Gfirebaseio.com',
  ]) {
    test(`permite: ${c}`, () => allowedSub(bash(c)));
  }
  for (const c of [
    'git log --format=secondmindv1',
    'git log -S x -- secondmindv1',
    'git log --grep=x && curl https://firestore.googleapis.com/v1',
    'git log --grep="$(curl -s https://x.cloudfunctions.net/f)"',
    'git show -Ssecondmindv1',
    // Falsos positivos aceptados (Docs/05 § 8): grep/rg sin comillas y -m con el host.
    'grep -r secondmindv1 src/',
    'rg googleapis.com',
    'git commit -m "docs: cita googleapis.com"',
  ]) {
    test(`bloquea: ${c}`, () => assert.match(blocked(bash(c)).reason, /\[http-prod\]/));
  }
});

describe('navegador MCP: texto y emuladores (revisión pendientes, MINOR 4)', () => {
  const pw = (t, ti) => ({ tool_name: `mcp__playwright__${t}`, tool_input: ti });
  test('tools de texto con una URL (no producción) en el texto → permitidas', () => {
    allowedSub(pw('browser_type', { ref: 'e3', text: 'ver https://example.com/doc' }));
    allowedSub(
      pw('browser_fill_form', {
        fields: [{ name: 'Fuente', type: 'textbox', ref: 'e5', value: 'http://localhost:3000/x' }],
      }),
    );
    allowedSub(pw('browser_wait_for', { text: 'https://example.com' }));
    allowedSub(pw('browser_press_sequentially', { ref: 'e1', text: 'http://127.0.0.1:9/' }));
  });
  test('tools de texto con referencias a producción → bloqueadas', () => {
    for (const ti of [
      { ref: 'e3', text: 'https://app.getsecondmind.co/notes' },
      { ref: 'e3', text: 'proyecto secondmindv1' },
    ])
      assert.match(blocked(pw('browser_type', ti)).reason, /mcp-browser.*producción/);
  });
  test('evaluate puede hablar con los emuladores (9099, 8080, 5001)', () => {
    for (const fn of [
      "() => fetch('http://localhost:9099/emulator/v1/projects/demo-secondmind/accounts')",
      "() => fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-secondmind/databases')",
      "() => fetch('http://127.0.0.1:5001/demo-secondmind/us-central1/f')",
    ])
      allowedSub(pw('browser_evaluate', { function: fn }));
  });
  test('evaluate a otros puertos o hosts → bloqueado; los puertos de emulador solo en evaluate', () => {
    for (const fn of [
      "() => fetch('http://localhost:4000/')",
      "() => fetch('http://localhost:5173/')",
      "() => fetch('https://example.com/')",
    ])
      assert.match(blocked(pw('browser_evaluate', { function: fn })).reason, /mcp-browser/);
    assert.match(
      blocked(pw('browser_navigate', { url: 'http://localhost:8080/' })).reason,
      /mcp-browser/,
    );
    assert.match(
      blocked(pw('browser_click', { ref: 'e1', element: 'link http://localhost:9099/' })).reason,
      /mcp-browser/,
    );
  });
});

describe('navegador MCP (seguimiento E0-T7)', () => {
  const nav = (url, tool = 'mcp__playwright__browser_navigate') => ({
    tool_name: tool,
    tool_input: { url },
  });
  for (const url of [
    'http://localhost:5173/',
    'http://localhost:5174/notes',
    'https://app.getsecondmind.co/',
    'https://secondmindv1.web.app',
    'http://localhost/',
    'http://localhost:51800/',
    'data:text/html,<script>fetch(1)</script>',
    'file:///C:/x.html',
  ]) {
    test(`bloquea navigate a ${url}`, () => assert.match(blocked(nav(url)).reason, /mcp-browser/));
  }
  test('bloquea abrir una pestaña nueva a otro puerto', () =>
    assert.match(
      blocked({
        tool_name: 'mcp__playwright__browser_tabs',
        tool_input: { action: 'new', url: 'http://127.0.0.1:5173/' },
      }).reason,
      /mcp-browser/,
    ));
  test('bloquea evaluate que navega fuera del emulador', () =>
    assert.match(
      blocked({
        tool_name: 'mcp__playwright__browser_evaluate',
        tool_input: { function: "() => { location.href = 'http://localhost:5173/' }" },
      }).reason,
      /mcp-browser/,
    ));
  // run_code corre JS en el proceso del server MCP (llega al `process` real): se bloquea
  // entero, con código en línea, ofuscado o cargado de un archivo (`filename`).
  for (const [tool, ti] of [
    [
      'mcp__plugin_playwright_playwright__browser_run_code_unsafe',
      { code: "await fetch('https://firestore.googleapis.com/v1/x')" },
    ],
    ['mcp__playwright__browser_run_code_unsafe', { filename: 'scratch/nav.js' }],
    [
      'mcp__playwright__browser_run_code_unsafe',
      { code: "async (page) => page.goto(atob('aHR0cHM6Ly9leGFtcGxlLmNvbQ=='))" },
    ],
    [
      'mcp__playwright__browser_run_code_unsafe',
      { code: "async () => process.mainModule.require('child_process').execSync('git push')" },
    ],
    ['mcp__playwright__browser_run_code_unsafe', { code: 'async (page) => page.title()' }],
    ['mcp__plugin_playwright_playwright__browser_run_code', {}],
  ]) {
    test(`bloquea run_code: ${tool.split('__').pop()} ${JSON.stringify(ti)}`, () =>
      assert.match(blocked({ tool_name: tool, tool_input: ti }).reason, /mcp-browser.*run_code/));
  }
  test('filename de salida (screenshot, snapshot, consola, evaluate) sigue permitido', () => {
    for (const [t, ti] of [
      ['browser_take_screenshot', { filename: 'shots/dashboard-375.png' }],
      ['browser_snapshot', { filename: 'snap.md' }],
      ['browser_console_messages', { filename: 'consola.txt' }],
      ['browser_evaluate', { function: '() => document.title', filename: 'out.json' }],
      ['browser_file_upload', { paths: ['D:/fixtures/nota.md'] }],
    ])
      allowedSub({ tool_name: `mcp__playwright__${t}`, tool_input: ti });
  });
  test('sesión principal puede usar run_code', () =>
    allowedMain({
      tool_name: 'mcp__playwright__browser_run_code_unsafe',
      tool_input: { filename: 'x.js' },
    }));
  for (const url of [
    'http://localhost:5180/',
    'http://localhost:5180/notes/abc?x=1',
    'http://127.0.0.1:5180',
    'http://localhost:4321/',
    'about:blank',
  ]) {
    test(`permite navigate a ${url}`, () => allowedSub(nav(url)));
  }
  test('permite snapshot, click y evaluate locales', () => {
    allowedSub({ tool_name: 'mcp__playwright__browser_snapshot', tool_input: {} });
    allowedSub({ tool_name: 'mcp__playwright__browser_click', tool_input: { ref: 'e12' } });
    allowedSub({
      tool_name: 'mcp__playwright__browser_evaluate',
      tool_input: { function: '() => document.title' },
    });
  });
  test('sesión principal puede navegar a cualquier lado', () =>
    allowedMain(nav('https://app.getsecondmind.co/')));
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

  test('el wrapper lee el package.json real: npm run x → firebase sin demo → exit 2', () => {
    writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ scripts: { x: 'firebase emulators:start', ok: 'node -v' } }),
    );
    try {
      const sub = (command) =>
        run({ tool_name: 'Bash', tool_input: { command }, cwd: tmp, agent_id: 'a1' });
      const b = sub('npm run x');
      assert.equal(b.status, 2);
      assert.match(b.stderr, /npm-script/);
      assert.equal(sub('npm run ok').status, 0);
      writeFileSync(path.join(tmp, 'package.json'), '{roto');
      assert.equal(sub('npm run ok').status, 2);
    } finally {
      rmSync(path.join(tmp, 'package.json'));
    }
  });

  after(() => rmSync(tmp, { recursive: true, force: true }));
});
