import { useParams } from 'react-router';

export default function NoteDetailPage() {
  // TODO F4: validar noteId contra notesStore y redirect a /notes si no existe
  const { noteId } = useParams<{ noteId: string }>();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Nota</h1>
      <p className="mt-2 text-sm text-muted-foreground">ID: {noteId}</p>
      <p className="mt-4 text-muted-foreground">Editor TipTap disponible en F4.</p>
    </div>
  );
}
