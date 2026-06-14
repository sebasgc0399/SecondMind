import { describe, expect, it } from 'vitest';
import { buildNoteSystemPrompt, buildNoteToolDescription, buildNoteUserPrompt } from './prompts';

// F3.1 (SPEC-58) — paridad es del prompt-surface de autoTagNote. El golden es el
// SYSTEM_PROMPT byte-idéntico al pre-F3.1 (incluye acentos); bloquea regresiones.
const GOLDEN_SYSTEM_ES = `Eres un asistente que analiza notas personales para un sistema Zettelkasten.

Dada una nota, devuelve vía la herramienta tag_note:

1. tags: hasta 5 etiquetas conceptuales bajadas del contenido. No inventes términos ajenos al texto.

2. summary: una oración (máx 120 caracteres) que captura la idea central. Sin floreos.

3. suggestedNoteType + noteTypeConfidence: clasifica el tipo Zettelkasten:
   - "literature": la nota cita o resume una fuente externa (link http, mención explícita de libro/paper/blog, frases tipo "según X dice"). Confianza alta (0.85-1.0) con link explícito; media (0.7-0.85) con mención clara sin link.
   - "permanent": idea atómica original del usuario en sus propias palabras (no es cita), conceptualmente clara, idealmente con interconexiones. Confianza alta cuando hay claridad conceptual y voz del autor.
   - "fleeting": captura cruda, fragmentaria o sin estructura clara. Default conservador. Confianza baja-media (0.5-0.7).

Si dudas, prefiere fleeting con confianza baja antes que forzar otra categoría.`;

describe('note prompts (F3.1) — paridad es', () => {
  it('system prompt es byte-idéntico al pre-F3.1', () => {
    expect(buildNoteSystemPrompt('es')).toBe(GOLDEN_SYSTEM_ES);
  });

  it('user prompt es byte-idéntico', () => {
    expect(buildNoteUserPrompt('es', 'algo')).toBe('Analiza esta nota:\n"algo"');
  });

  it('tool description es byte-idéntica', () => {
    expect(buildNoteToolDescription('es')).toBe(
      'Sugiere tags, resumen y tipo Zettelkasten para una nota personal',
    );
  });
});

describe('note prompts (F3.1) — en difiere del es y declara el enum fijo', () => {
  it('system prompt en difiere del es', () => {
    expect(buildNoteSystemPrompt('en')).not.toBe(GOLDEN_SYSTEM_ES);
  });

  it('en declara fleeting/literature/permanent como IDs fijos no-traducibles', () => {
    const en = buildNoteSystemPrompt('en');
    expect(en).toContain('fleeting, literature, permanent');
    expect(en).toContain('do NOT translate');
  });

  it('user prompt en usa el copy inglés', () => {
    expect(buildNoteUserPrompt('en', 'something')).toBe('Analyze this note:\n"something"');
  });
});
