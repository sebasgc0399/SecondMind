import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendEmail } from './sendEmail';

// SPEC-65 F1.2 — el unit test es el DUEÑO de la garantía no-throw del helper (vi.mock NO cruza
// al proceso forkeado del emulador de Functions, así que el e2e no puede mockear el SDK: ahí
// solo se asserta el invariante del approve). Acá mockeamos `resend` para cubrir las 3 ramas:
// éxito, error de API (el SDK NO throwea, devuelve { data, error }), y throw de transporte.

// vi.hoisted: el mock debe existir cuando el factory de vi.mock corre (hoisted al top del módulo).
// La clase mock hace que `new Resend(key).emails.send` sea sendMock (una arrow NO es constructor).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

beforeEach(() => {
  sendMock.mockReset();
});

const params = { to: 'postulante@example.com', subject: 's', text: 't', apiKey: 're_test' };

describe('sendEmail (SPEC-65 F1.2)', () => {
  it('éxito → { ok: true, id }', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-123' }, error: null });
    await expect(sendEmail(params)).resolves.toEqual({ ok: true, id: 'email-123' });
  });

  it('error de API (Resend NO throwea, devuelve { error }) → { ok: false } sin throw', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Domain not verified' },
    });
    await expect(sendEmail(params)).resolves.toEqual({ ok: false });
  });

  it('throw de transporte (red caída) → { ok: false } sin throw', async () => {
    sendMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(sendEmail(params)).resolves.toEqual({ ok: false });
  });
});
