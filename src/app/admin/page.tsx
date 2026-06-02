import { Navigate } from 'react-router';
import useAuth from '@/hooks/useAuth';
import AccessRequestQueue from '@/components/admin/AccessRequestQueue';

// SPEC-52 F6 — ruta /admin (lazy, hija del Layout → hereda el gate anónimo→/login y
// verified→/verify-email). El gate por uid acá es COSMÉTICO: oculta la ruta a no-admins.
// La seguridad REAL está en las CFs (requireAdmin server-side por ADMIN_EMAIL). Sin
// VITE_ADMIN_UID configurado → denegar (fail-closed).
export default function AdminPage() {
  const { user } = useAuth();
  const adminUid = import.meta.env.VITE_ADMIN_UID as string | undefined;

  if (!adminUid || user?.uid !== adminUid) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Solicitudes de acceso</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Aprobá o rechazá las solicitudes pendientes de la beta.
      </p>
      <AccessRequestQueue />
    </div>
  );
}
