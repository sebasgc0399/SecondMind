import { useState } from 'react';
import { Navigate } from 'react-router';
import { Tabs } from '@base-ui/react/tabs';
import useAuth from '@/hooks/useAuth';
import useAccessRequestsQueue from '@/hooks/useAccessRequestsQueue';
import useAllowlistMembers from '@/hooks/useAllowlistMembers';
import AccessRequestQueue from '@/components/admin/AccessRequestQueue';
import AllowlistMembers from '@/components/admin/AllowlistMembers';

type AdminTab = 'requests' | 'members';

// SPEC-52 F6 / SPEC-53 F13 — ruta /admin (lazy, hija del Layout → hereda el gate
// anónimo→/login y verified→/verify-email). El gate por uid acá es COSMÉTICO: oculta la
// ruta a no-admins. La seguridad REAL está en las CFs (requireAdmin server-side por
// ADMIN_EMAIL). Sin VITE_ADMIN_UID configurado → denegar (fail-closed).
//
// SPEC-53 F13: dos tabs (Solicitudes / Miembros) para separar las dos tareas distintas del
// admin —procesar la cola vs gestionar miembros— que rara vez se hacen a la vez (foco, no
// porque las listas sean largas). Los datos se fetchean acá y se pasan a cada panel → el
// contador de cada tab queda at-a-glance sin tener que entrar.
export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const adminUid = import.meta.env.VITE_ADMIN_UID as string | undefined;
  const requests = useAccessRequestsQueue();
  const members = useAllowlistMembers();
  const [tab, setTab] = useState<AdminTab>('requests');

  // useAuth resuelve el user async (onAuthStateChanged dispara en el próximo tick); esperar a
  // isLoading evita que el admin real rebote a / antes de que llegue la sesión (fix d42c03a).
  if (isLoading) return null;
  if (!adminUid || user?.uid !== adminUid) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Procesá solicitudes de acceso y gestioná los miembros de la beta.
      </p>

      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as AdminTab)}>
        <Tabs.List className="relative mb-6 flex gap-1 border-b border-border">
          <Tabs.Tab
            value="requests"
            className="relative flex h-10 flex-1 items-center justify-center px-4 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground data-selected:text-foreground"
          >
            Solicitudes{!requests.isLoading && ` (${requests.requests.length})`}
          </Tabs.Tab>
          <Tabs.Tab
            value="members"
            className="relative flex h-10 flex-1 items-center justify-center px-4 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground data-selected:text-foreground"
          >
            Miembros{!members.isLoading && ` (${members.members.length})`}
          </Tabs.Tab>
          <Tabs.Indicator className="absolute bottom-[-1px] left-0 h-[2px] w-(--active-tab-width) translate-x-(--active-tab-left) bg-primary transition-[translate,width] duration-200 ease-out" />
        </Tabs.List>

        <Tabs.Panel value="requests" className="outline-none">
          <AccessRequestQueue data={requests} />
        </Tabs.Panel>
        <Tabs.Panel value="members" className="outline-none">
          <AllowlistMembers data={members} />
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}
