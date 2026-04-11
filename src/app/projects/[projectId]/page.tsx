import { useParams } from 'react-router';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Proyecto</h1>
        <p className="text-sm text-muted-foreground">{projectId}</p>
      </header>
      <p className="text-muted-foreground">Próximamente — Fase 2 F5</p>
    </div>
  );
}
