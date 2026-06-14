import { describe, expect, it } from 'vitest';
import { buildInboxSystemPrompt, buildInboxToolDescription, buildInboxUserPrompt } from './prompts';

// F3.1 (SPEC-58) — paridad es del prompt-surface de processInboxItem. El golden es
// el SYSTEM_PROMPT byte-idéntico al pre-F3.1; bloquea regresiones del prompt es.
const GOLDEN_SYSTEM_ES = `Eres un asistente de productividad personal. Analizas capturas rapidas del usuario y sugieres como clasificarlas. El usuario tiene estas areas: Proyectos, Conocimiento, Finanzas, Salud y Ejercicio, Pareja, Habitos.

Devuelve confidence entre 0 y 1: que tan seguro estas de la clasificacion completa (tipo + area + titulo). Usa >0.9 para casos obvios, 0.7-0.9 para casos claros, <0.7 para ambiguedades.`;

describe('inbox prompts (F3.1) — paridad es', () => {
  it('system prompt es byte-idéntico al pre-F3.1', () => {
    expect(buildInboxSystemPrompt('es')).toBe(GOLDEN_SYSTEM_ES);
  });

  it('user prompt es byte-idéntico', () => {
    expect(buildInboxUserPrompt('es', 'algo')).toBe('Clasifica esta captura:\n"algo"');
  });

  it('tool description es byte-idéntica', () => {
    expect(buildInboxToolDescription('es')).toBe('Clasifica una captura de inbox del usuario');
  });
});

describe('inbox prompts (F3.1) — en difiere del es y declara enums fijos', () => {
  it('system prompt en difiere del es', () => {
    expect(buildInboxSystemPrompt('en')).not.toBe(GOLDEN_SYSTEM_ES);
  });

  it('en declara los IDs canónicos de área y la regla no-traducir', () => {
    const en = buildInboxSystemPrompt('en');
    expect(en).toContain('proyectos');
    expect(en).toContain('never translate');
  });

  it('user prompt en usa el copy inglés', () => {
    expect(buildInboxUserPrompt('en', 'something')).toBe('Classify this capture:\n"something"');
  });
});
