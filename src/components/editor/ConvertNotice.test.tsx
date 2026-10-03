// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ConvertNotice from '@/components/editor/ConvertNotice';
import useConvertNotice, { CONVERT_NOTICE_MS } from '@/hooks/useConvertNotice';
import { initTestI18n } from '@/test/i18n';
import type { ConvertSelectionResult } from '@/hooks/useConvertSelectionToNote';

// Mismo cableado que NoteEditor: el hook alimenta el aviso inline. Los botones simulan
// el resultado que reporta el BubbleToolbar.
const RESULTS: ConvertSelectionResult[] = ['done', 'error', 'noop'];
function Harness() {
  const { notice, handleConvertResult } = useConvertNotice();
  return (
    <>
      {RESULTS.map((result) => (
        <button key={result} type="button" onClick={() => handleConvertResult(result)}>
          {result}
        </button>
      ))}
      <ConvertNotice notice={notice} />
    </>
  );
}

const report = (result: ConvertSelectionResult) =>
  fireEvent.click(screen.getByRole('button', { name: result }));

const DONE = 'Nota creada y enlazada';

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('aviso de "Convertir en nota"', () => {
  it('done: aparece en la región de estado y se va a los 3 s', () => {
    render(<Harness />);
    expect(screen.getByRole('status').textContent).toBe('');

    act(() => report('done'));
    expect(screen.getByRole('status').textContent).toBe(DONE);

    act(() => vi.advanceTimersByTime(CONVERT_NOTICE_MS - 1));
    expect(screen.getByRole('status').textContent).toBe(DONE);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('error: muestra el error y noop no avisa', () => {
    render(<Harness />);
    act(() => report('error'));
    expect(screen.getByRole('status').textContent).toBe('Error al guardar');
    act(() => report('noop'));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('dos done seguidos reinician el timer', () => {
    render(<Harness />);
    act(() => report('done'));
    act(() => vi.advanceTimersByTime(2000));
    act(() => report('done'));
    // Sin reinicio, el primer timer lo borraría a los 3 s del primer evento.
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status').textContent).toBe(DONE);
    act(() => vi.advanceTimersByTime(CONVERT_NOTICE_MS - 2000));
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
