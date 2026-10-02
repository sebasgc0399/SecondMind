import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateProviderKey } from './validateProviderKey';

// SPEC-69 T4 — la URL base de Anthropic sale de ANTHROPIC_BASE_URL si existe (solo en el
// emulador, sin egreso) y si no, de la API real (producción).
function stubFetch(status: number) {
  const fetchMock = vi.fn(async () => new Response(null, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('validateProviderKey (anthropic)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sin ANTHROPIC_BASE_URL → pega a https://api.anthropic.com/v1/models', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', undefined);
    const fetchMock = stubFetch(200);
    expect(await validateProviderKey('anthropic', 'sk-ant-x')).toBe('valid');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.anything(),
    );
  });

  it('con ANTHROPIC_BASE_URL → pega a esa base (emulador, sin egreso)', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://127.0.0.1:9');
    const fetchMock = stubFetch(401);
    expect(await validateProviderKey('anthropic', 'sk-ant-x')).toBe('invalid');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:9/v1/models', expect.anything());
  });

  it('error de red (conexión rechazada) → unknown', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://127.0.0.1:9');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(await validateProviderKey('anthropic', 'sk-ant-x')).toBe('unknown');
  });
});
