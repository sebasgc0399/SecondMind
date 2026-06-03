import { Navigate } from 'react-router';
import useAuth from '@/hooks/useAuth';
import AccessRequestQueue from '@/components/admin/AccessRequestQueue';
import AllowlistMembers from '@/components/admin/AllowlistMembers';

// SPEC-52 F6 — ruta /admin (lazy, hija del Layout → hereda el gate anónimo→/login y
// verified→/verify-email). El gate por uid acá es COSMÉTICO: oculta la ruta a no-admins.
// La seguridad REAL está en las CFs (requireAdmin server-side por ADMIN_EMAIL). Sin
// VITE_ADMIN_UID configurado → denegar (fail-closed).
export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const adminUid = import.meta.env.VITE_ADMIN_UID as string | undefined;

  // useAuth resuelve el user de forma async (onAuthStateChanged dispara en el próximo
  // tick). En el PRIMER render user es null aunque haya sesión → si evaluáramos el gate
  // ya, el admin real rebotaría a / antes de que llegue la sesión. Esperar a isLoading.
  if (isLoading) return null;
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

      <h2 className="mt-10 text-2xl font-bold tracking-tight">Miembros de la beta</h2>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Quiénes tienen acceso hoy. Revocar saca a alguien de la beta (no borra su cuenta ni sus
        datos).
      </p>
      <AllowlistMembers />
    </div>
  );
}
