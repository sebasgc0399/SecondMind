import useAuth from '@/hooks/useAuth';

export default function Greeting() {
  const { user } = useAuth();
  const hour = new Date().getHours();
  const salute = getSalute(hour);
  const firstName = user?.displayName?.split(' ')[0] ?? 'hola';

  return (
    <h1 className="text-3xl font-bold tracking-tight text-foreground">
      {salute}, {firstName}
    </h1>
  );
}

function getSalute(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
