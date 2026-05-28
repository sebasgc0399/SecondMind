// Sanitiza un error para logging seguro: extrae `code` si existe, trunca
// `message` a 200 chars. Nunca loguear el err raw — Anthropic/OpenAI SDKs
// incluyen partes del prompt en el message del error en ciertos casos
// (timeout, rate limit con echo) que persistirían en Cloud Logging con
// contenido del user. M3 de la auditoría 2026-05.

const MAX_MESSAGE_CHARS = 200;

export function sanitizeError(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return {
      code: typeof code === 'string' ? code : undefined,
      message: error.message.slice(0, MAX_MESSAGE_CHARS),
    };
  }
  return { message: String(error).slice(0, MAX_MESSAGE_CHARS) };
}
