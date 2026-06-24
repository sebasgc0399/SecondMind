import { describe, it, expect } from 'vitest';
import { buildWikilinkResolver } from './wikilinkResolver';

const resolve = buildWikilinkResolver([
  { id: 'n1', title: 'Nota Uno' },
  { id: 'n2', title: 'Con / barra' }, // sanitiza a "Con barra" → basename != título
  { id: 'n3', title: 'Dup' },
  { id: 'n4', title: 'Dup' }, // colisión → basename con sufijo
]);

describe('buildWikilinkResolver (D3)', () => {
  it('resuelve por noteId con título FRESCO, ignorando el display congelado', () => {
    expect(resolve('n1', 'TITULO VIEJO CONGELADO')).toBe('[[Nota Uno]]');
  });

  it('usa forma alias [[basename|Título]] cuando el basename difiere del título', () => {
    expect(resolve('n2', 'stale')).toBe('[[Con barra|Con / barra]]');
  });

  it('colisión de título → el segundo usa basename con sufijo, en forma alias', () => {
    expect(resolve('n3', '')).toBe('[[Dup]]');
    expect(resolve('n4', '')).toBe('[[Dup-n4|Dup]]');
  });

  it('dangling (noteId fuera del set) → texto plano marcado con corchetes literales', () => {
    expect(resolve('zzz', 'Título Borrado')).toBe('\\[\\[Título Borrado\\]\\]');
  });

  it('dangling sin display → usa "nota"', () => {
    expect(resolve('zzz', '')).toBe('\\[\\[nota\\]\\]');
  });

  it('noteId null/undefined → texto plano (suggestion sin resolver)', () => {
    expect(resolve(null, 'lo que tipeó')).toBe('lo que tipeó');
    expect(resolve(undefined, 'x')).toBe('x');
  });

  it('escapa corchetes/pipe en el texto degradado para no inyectar sintaxis', () => {
    expect(resolve('zzz', 'a [b] | c')).toBe('\\[\\[a \\[b\\] \\| c\\]\\]');
  });
});
