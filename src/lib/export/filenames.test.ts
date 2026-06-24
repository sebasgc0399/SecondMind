import { describe, it, expect } from 'vitest';
import { sanitizeTitleForFilename, buildFilenameMap } from './filenames';

describe('sanitizeTitleForFilename', () => {
  it('neutraliza caracteres inválidos de filesystem', () => {
    expect(sanitizeTitleForFilename('a/b:c*d?e"f<g>h|i\\j')).toBe('a b c d e f g h i j');
  });

  it('colapsa espacios y trimea', () => {
    expect(sanitizeTitleForFilename('  hola    mundo  ')).toBe('hola mundo');
  });

  it('quita punto/espacio final (Windows)', () => {
    expect(sanitizeTitleForFilename('archivo.')).toBe('archivo');
    expect(sanitizeTitleForFilename('archivo   ')).toBe('archivo');
  });

  it('título vacío o solo-inválidos → ""', () => {
    expect(sanitizeTitleForFilename('')).toBe('');
    expect(sanitizeTitleForFilename('///')).toBe('');
  });

  it('limita el largo', () => {
    expect(sanitizeTitleForFilename('x'.repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe('buildFilenameMap', () => {
  it('títulos únicos → basenames legibles', () => {
    const map = buildFilenameMap([
      { id: 'a1', title: 'Primera nota' },
      { id: 'b2', title: 'Segunda nota' },
    ]);
    expect(map.get('a1')).toBe('Primera nota');
    expect(map.get('b2')).toBe('Segunda nota');
  });

  it('colisión de título → sufijo con noteId corto', () => {
    const map = buildFilenameMap([
      { id: 'aaaaaa11', title: 'Duplicada' },
      { id: 'bbbbbb22', title: 'Duplicada' },
    ]);
    expect(map.get('aaaaaa11')).toBe('Duplicada');
    expect(map.get('bbbbbb22')).toBe('Duplicada-bbbbbb');
    expect(map.get('aaaaaa11')).not.toBe(map.get('bbbbbb22'));
  });

  it('colisión case-insensitive (Windows/macOS)', () => {
    const map = buildFilenameMap([
      { id: 'aaaaaa11', title: 'NOTA' },
      { id: 'bbbbbb22', title: 'nota' },
    ]);
    expect(map.get('aaaaaa11')?.toLowerCase()).not.toBe(map.get('bbbbbb22')?.toLowerCase());
  });

  it('título vacío → Sin-titulo-<id>', () => {
    const map = buildFilenameMap([{ id: 'xyz123ab', title: '' }]);
    expect(map.get('xyz123ab')).toBe('Sin-titulo-xyz123');
  });

  it('todos los basenames son únicos (incluso varias colisiones)', () => {
    const notes = [
      { id: 'id000001', title: 'Misma' },
      { id: 'id000002', title: 'Misma' },
      { id: 'id000003', title: 'Misma' },
      { id: 'id000004', title: '' },
      { id: 'id000005', title: '' },
    ];
    const map = buildFilenameMap(notes);
    const names = [...map.values()].map((n) => n.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
