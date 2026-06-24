import { describe, it, expect } from 'vitest';
import { exportFilename } from './deliverExport';

describe('exportFilename', () => {
  it('formato secondmind-export-YYYY-MM-DD.zip', () => {
    expect(exportFilename(new Date(Date.UTC(2026, 5, 20)))).toBe(
      'secondmind-export-2026-06-20.zip',
    );
  });

  it('usa la fecha UTC (estable cross-timezone)', () => {
    expect(exportFilename(new Date(Date.UTC(2025, 0, 1, 23, 59)))).toBe(
      'secondmind-export-2025-01-01.zip',
    );
  });
});
