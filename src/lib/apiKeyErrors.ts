// Mapea errores de las callables BYOK (FunctionsError con code 'functions/*')
// a mensajes en español. Molde: src/lib/authErrors.ts.
export function mapApiKeyError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'functions/invalid-argument':
      return 'La API key es inválida.';
    case 'functions/unavailable':
      return 'No pudimos validar la key ahora. Probá de nuevo en un momento.';
    case 'functions/unauthenticated':
      return 'Tenés que iniciar sesión.';
    default:
      return 'No se pudo guardar la API key. Intentá de nuevo.';
  }
}
