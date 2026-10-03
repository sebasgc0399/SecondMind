import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConvertNoticeKind } from '@/hooks/useConvertNotice';

interface ConvertNoticeProps {
  notice: ConvertNoticeKind | null;
}

/** Aviso inline del resultado de "Convertir en nota" (E2-T3-d). */
export default function ConvertNotice({ notice }: ConvertNoticeProps) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite">
      {notice === 'done' && (
        <span className="inline-flex items-center gap-1 text-xs text-primary">
          <Check className="h-3 w-3" aria-hidden />
          {t('editor.bubble.convertToNoteDone', 'Nota creada y enlazada')}
        </span>
      )}
      {notice === 'error' && (
        <span className="text-xs text-destructive">
          {t('editor.save.error', 'Error al guardar')}
        </span>
      )}
    </div>
  );
}
