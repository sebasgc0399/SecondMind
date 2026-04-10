import { useCell, useRowIds } from 'tinybase/ui-react';
import { notesStore } from '@/stores/notesStore';
import { Button } from '@/components/ui/button';

// TEST COMPONENT — se elimina en Fase 1
function SyncTestRow({ rowId }: { rowId: string }) {
  const title = useCell('notes', rowId, 'title');
  return (
    <li className="text-sm text-muted-foreground">
      [{rowId.slice(0, 6)}] {String(title) || '(sin título)'}
    </li>
  );
}

function SyncTest() {
  const rowIds = useRowIds('notes');

  function handleAddNote() {
    const id = `test-${Date.now()}`;
    notesStore.setRow('notes', id, {
      title: `Nota de prueba ${new Date().toLocaleTimeString()}`,
      paraType: 'resource',
      noteType: 'fleeting',
    });
  }

  return (
    <div className="mt-6 rounded-md border border-border p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        TEST — Sync TinyBase ↔ Firestore (se elimina en Fase 1)
      </p>
      <Button size="sm" onClick={handleAddNote}>
        Escribir nota de prueba
      </Button>
      {rowIds.length > 0 && (
        <ul className="mt-3 space-y-1">
          {rowIds.map((id) => (
            <SyncTestRow key={id} rowId={id} />
          ))}
        </ul>
      )}
      {rowIds.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sin datos. Escribe una nota y verificá en Firebase Console.
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">SecondMind — Fase 0</h1>
      <p className="mt-2 text-muted-foreground">
        Setup completo. Estructura base lista para construir features.
      </p>
      <SyncTest />
    </div>
  );
}
