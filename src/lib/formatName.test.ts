import { describe, it, expect } from 'vitest';
import { formatName } from './formatName';

describe('formatName', () => {
  it('capitaliza un nombre en minúsculas', () => {
    expect(formatName('sebastian gutierrez')).toBe('Sebastian Gutierrez');
  });

  it('pasa MAYÚSCULAS a title-case', () => {
    expect(formatName('MARIA DE LA CRUZ')).toBe('Maria De La Cruz');
  });

  it('preserva acentos', () => {
    expect(formatName('juan pérez')).toBe('Juan Pérez');
    expect(formatName('josé maría')).toBe('José María');
  });

  it('capitaliza cada parte de un apellido con guion', () => {
    expect(formatName('garcía-lópez')).toBe('García-López');
  });

  it('maneja un solo nombre', () => {
    expect(formatName('sebastian')).toBe('Sebastian');
  });

  it('colapsa espacios múltiples y recorta', () => {
    expect(formatName('  sebastian   gutierrez  ')).toBe('Sebastian Gutierrez');
  });

  it('es idempotente', () => {
    const once = formatName('SEBASTIAN gutierrez');
    expect(formatName(once)).toBe(once);
  });

  it('devuelve cadena vacía para null, undefined y vacío', () => {
    expect(formatName(null)).toBe('');
    expect(formatName(undefined)).toBe('');
    expect(formatName('')).toBe('');
    expect(formatName('   ')).toBe('');
  });
});
