import type { Locale } from '../lib/getUserLocale';

// F3.1 (SPEC-58): prompt-surface bilingüe de processInboxItem. La rama `es` es
// BYTE-IDÉNTICA al prompt pre-F3.1 (verificado por prompts.test.ts → cero
// regresión es). La rama `en` lista las áreas con su label inglés Y su ID fijo
// entre paréntesis, y declara que suggestedType/Area/priority son IDs que NO se
// traducen (defensa D5; refuerza las description del schema en). El cliente
// muestra el label traducido vía entityLabels; el VALOR persistido es el ID.

const SYSTEM_PROMPT: Record<Locale, string> = {
  es: `Eres un asistente de productividad personal. Analizas capturas rapidas del usuario y sugieres como clasificarlas. El usuario tiene estas areas: Proyectos, Conocimiento, Finanzas, Salud y Ejercicio, Pareja, Habitos.

Devuelve confidence entre 0 y 1: que tan seguro estas de la clasificacion completa (tipo + area + titulo). Usa >0.9 para casos obvios, 0.7-0.9 para casos claros, <0.7 para ambiguedades.`,
  en: `You are a personal productivity assistant. You analyze the user's quick captures and suggest how to classify them. The user has these life areas (use the ID in parentheses as the suggestedArea value): Projects (proyectos), Knowledge (conocimiento), Finance (finanzas), Health & Exercise (salud), Relationship (pareja), Habits (habitos).

Return confidence between 0 and 1: how sure you are of the full classification (type + area + title). Use >0.9 for obvious cases, 0.7-0.9 for clear cases, <0.7 for ambiguities.

IMPORTANT: the suggestedType, suggestedArea and priority fields are fixed identifiers - return them EXACTLY as listed in the tool schema (e.g. proyectos, conocimiento), never translate or rephrase them. Only suggestedTitle, summary and the tags must be written in English.`,
};

const TOOL_DESCRIPTION: Record<Locale, string> = {
  es: 'Clasifica una captura de inbox del usuario',
  en: 'Classifies a user inbox capture',
};

export function buildInboxSystemPrompt(locale: Locale): string {
  return SYSTEM_PROMPT[locale];
}

export function buildInboxToolDescription(locale: Locale): string {
  return TOOL_DESCRIPTION[locale];
}

export function buildInboxUserPrompt(locale: Locale, rawContent: string): string {
  return locale === 'en'
    ? `Classify this capture:\n"${rawContent}"`
    : `Clasifica esta captura:\n"${rawContent}"`;
}
