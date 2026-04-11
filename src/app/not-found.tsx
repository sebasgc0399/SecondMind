import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold tracking-tight">404</h1>
      <p className="text-muted-foreground">Página no encontrada</p>
      <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Volver al dashboard
      </Link>
    </div>
  );
}
