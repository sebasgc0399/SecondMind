import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import { formatName } from '@/lib/formatName';

// F58: una key por franja horaria con {{name}} interpolado — une saludo y
// nombre en una sola frase traducible (el orden puede variar por idioma).
export default function Greeting() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const name =
    formatName(user?.displayName?.split(' ')[0]) || t('dashboard.greeting.fallbackName', 'hola');
  const salute =
    hour >= 5 && hour < 12
      ? t('dashboard.greeting.morning', 'Buenos días, {{name}}', { name })
      : hour >= 12 && hour < 20
      ? t('dashboard.greeting.afternoon', 'Buenas tardes, {{name}}', { name })
      : t('dashboard.greeting.night', 'Buenas noches, {{name}}', { name });

  return <h1 className="text-3xl font-bold tracking-tight text-foreground">{salute}</h1>;
}
