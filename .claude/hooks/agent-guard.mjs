#!/usr/bin/env node
// agent-guard — hook PreToolUse (SPEC-69 T2, invariante I1).
//
// Wrapper delgado: lee el JSON de stdin, arma el entorno (sentinels, rama) y
// delega en `evaluate` de agent-guard-lib.mjs. Exit 2 = bloquear (el motivo va
// a stderr y lo ve el modelo); exit 0 = permitir.
//
// Fail-safe: si stdin no se puede parsear o hay un error interno (incluido un
// error al cargar la lib), en modo restringido se bloquea; fuera de él se
// permite para no romper la sesión normal de Sebastián (I4), pero el error se
// imprime igual en stderr.
//
// La lib se importa dinámicamente a propósito: un error de sintaxis en ella
// haría fallar un import estático con exit 1, que Claude Code trata como
// "no bloqueante" (falso negativo silencioso).

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const loopActive = existsSync(path.join(projectDir, '.claude', 'loop.active'));
const unlocked = existsSync(path.join(projectDir, '.claude', 'guard.unlock'));

let raw = '';
let restricted = loopActive;

function failSafe(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (restricted) {
    process.stderr.write(
      `agent-guard: guard error, bloqueado por seguridad (${msg}); detenete y reportá al orquestador.\n`,
    );
    process.exit(2);
  }
  process.stderr.write(
    `agent-guard: error interno, se permite fuera del modo restringido (${msg}).\n`,
  );
  process.exit(0);
}

process.on('uncaughtException', failSafe);

/** Rama del repo que contiene `abs` (sube hasta el primer directorio existente). */
function getBranch(abs) {
  let dir = abs;
  try {
    while (dir && !(existsSync(dir) && statSync(dir).isDirectory())) {
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
    const out = execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/**
 * `scripts` del package.json de `dir`, o null si no hay package.json. Un JSON
 * ilegible lanza: la lib lo trata como no verificable y bloquea.
 */
function readScripts(dir) {
  const file = path.join(dir, 'package.json');
  if (!existsSync(file)) return null;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  return pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
}

try {
  raw = readFileSync(0, 'utf8');
} catch {
  raw = '';
}

let input;
try {
  input = JSON.parse(raw);
  if (!input || typeof input !== 'object') throw new Error('stdin no es un objeto JSON');
} catch (err) {
  // Sin JSON no se puede leer agent_id: se infiere del texto crudo.
  restricted = loopActive || /"agent_id"\s*:\s*"[^"]/.test(raw);
  failSafe(err);
}

restricted = loopActive || Boolean(input.agent_id);

try {
  const { evaluate } = await import('./agent-guard-lib.mjs');
  const result = evaluate(input, { projectDir, loopActive, unlocked, getBranch, readScripts });
  if (result.block) {
    process.stderr.write(`${result.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  failSafe(err);
}
