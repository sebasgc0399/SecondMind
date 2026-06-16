// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChangelogHistory from '@/components/changelog/ChangelogHistory';
import { initTestI18n, tEs } from '@/test/i18n';

// Registry mock con 2 entradas en orden de release ascendente: ejercita el
// reverse de forma significativa (con 1 entrada real no se distinguiría). Ambas
// usan la key i18n REAL 'v052' → los textos resuelven contra el catálogo; no
// inventamos keys (tEs rechazaría las inexistentes). El orden se afirma por
// data-version, no por título (ambas cards comparten copy v052).
vi.mock('@/lib/changelog', () => ({
  CHANGELOG_ENTRIES: [
    { version: '0.5.2', key: 'v052' },
    { version: '0.5.99', key: 'v052' },
  ],
}));

describe('ChangelogHistory (F60)', () => {
  beforeEach(async () => {
    await initTestI18n();
  });

  it('renderiza una card por entrada del catálogo', () => {
    const { container } = render(<ChangelogHistory />);
    expect(container.querySelectorAll('[data-version]')).toHaveLength(2);
  });

  it('orden newest-first: reverse del registry, sin semver (D4)', () => {
    const { container } = render(<ChangelogHistory />);
    const versions = Array.from(container.querySelectorAll('[data-version]')).map((el) =>
      el.getAttribute('data-version'),
    );
    expect(versions).toEqual(['0.5.99', '0.5.2']);
  });

  it('renderiza título + bullets de cada entrada desde i18n (returnObjects)', () => {
    render(<ChangelogHistory />);
    expect(screen.getAllByText(tEs('changelog.v052.title'))).toHaveLength(2);
    expect(screen.getAllByText(tEs('changelog.v052.items.0')).length).toBeGreaterThan(0);
  });
});
