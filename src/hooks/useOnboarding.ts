import { useCallback, useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import useApiKeys from '@/hooks/useApiKeys';
import usePreferences from '@/hooks/usePreferences';
import useQuickCapture from '@/hooks/useQuickCapture';
import { useStoreHydration } from '@/hooks/useStoreHydration';
import { setPreferences } from '@/lib/preferences';

export type OnboardingStepId = 'apiKey' | 'firstNote' | 'inboxAi' | 'firstTask';

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  description: string;
  done: boolean;
  ctaLabel: string;
  /** Deep-link de destino (Link). Mutuamente excluyente con ctaAction. */
  ctaTo?: string;
  /** Acción imperativa (button onClick), ej. abrir Quick Capture. */
  ctaAction?: () => void;
}

export interface UseOnboardingReturn {
  steps: OnboardingStep[];
  completedCount: number;
  allComplete: boolean;
  shouldShowWelcome: boolean;
  shouldShowChecklist: boolean;
  markWelcomeSeen: () => Promise<void>;
  dismissChecklist: () => Promise<void>;
}

/**
 * Lógica central del onboarding (D8): elegibilidad del welcome modal,
 * completitud reactiva de los 4 hitos y acciones de persistencia. Los
 * componentes (WelcomeModal, OnboardingChecklist) solo renderizan el estado
 * derivado que expone este hook.
 *
 * Gate triple (D3, riesgo #1): nada de visibilidad ni "cuenta vacía" se evalúa
 * hasta que las tres fuentes hidrataron — preferences, apiKeys y los stores
 * TinyBase. Sin esto, "cuenta vacía" se mide contra stores pre-snapshot y un
 * usuario existente vería el welcome por un instante.
 */
export default function useOnboarding(): UseOnboardingReturn {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { preferences, isLoaded: prefsLoaded } = usePreferences();
  const { apiKeys, isLoaded: keysLoaded } = useApiKeys();
  const { isHydrating } = useStoreHydration();
  const { open: openQuickCapture } = useQuickCapture();

  const notesTable = useTable('notes');
  const inboxTable = useTable('inbox', 'inbox');
  const tasksTable = useTable('tasks', 'tasks');

  const ready = prefsLoaded && keysLoaded && !isHydrating;

  // Hito ①: la key Anthropic está configurada (BYOK, F48). Sin ella la IA de
  // generación está deshabilitada — por eso es el primer hito.
  const apiKeyDone = apiKeys.anthropic.configured;

  // Hito ②: ≥1 nota activa (no archivada, no en papelera). Mismo criterio que
  // RecentNotesCard. `!row.deletedAt` cubre 0/ausente = no borrada.
  const firstNoteDone = useMemo(
    () => Object.values(notesTable).some((row) => row.isArchived !== true && !row.deletedAt),
    [notesTable],
  );

  // Hito ③ (el "aha"): ≥1 item del inbox procesado por IA. `aiProcessed` lo
  // setea la CF processInboxItem y NUNCA se revierte (la row no se borra al
  // convertir/descartar) → condición monótona. NO filtrar por status: tras
  // procesar, el item sigue 'pending' (ese ES el momento aha).
  const inboxAiDone = useMemo(
    () => Object.values(inboxTable).some((row) => row.aiProcessed === true),
    [inboxTable],
  );

  // Hito ④: ≥1 tarea activa. `tasks` no tiene `deletedAt` (solo isArchived).
  const firstTaskDone = useMemo(
    () => Object.values(tasksTable).some((row) => row.isArchived !== true),
    [tasksTable],
  );

  const openCapture = useCallback(() => {
    openQuickCapture(undefined, { source: 'onboarding' });
  }, [openQuickCapture]);

  const steps = useMemo<OnboardingStep[]>(
    () => [
      {
        id: 'apiKey',
        label: t('onboarding.steps.apiKey.label', 'Conectá tu IA'),
        description: t(
          'onboarding.steps.apiKey.description',
          'Configurá tu API key de Anthropic para activar la clasificación con IA.',
        ),
        done: apiKeyDone,
        ctaLabel: t('onboarding.steps.apiKey.ctaLabel', 'Configurar'),
        ctaTo: '/settings#api-keys',
      },
      {
        id: 'firstNote',
        label: t('onboarding.steps.firstNote.label', 'Creá tu primera nota'),
        description: t(
          'onboarding.steps.firstNote.description',
          'Empezá a construir tu segundo cerebro con una nota.',
        ),
        done: firstNoteDone,
        ctaLabel: t('onboarding.steps.firstNote.ctaLabel', 'Crear nota'),
        ctaTo: '/notes',
      },
      {
        id: 'inboxAi',
        label: t('onboarding.steps.inboxAi.label', 'Probá la magia de la IA'),
        description: t(
          'onboarding.steps.inboxAi.description',
          'Capturá una idea y mirá cómo la IA la organiza por vos.',
        ),
        done: inboxAiDone,
        ctaLabel: t('onboarding.steps.inboxAi.ctaLabel', 'Capturar'),
        ctaAction: openCapture,
      },
      {
        id: 'firstTask',
        label: t('onboarding.steps.firstTask.label', 'Creá tu primera tarea'),
        description: t(
          'onboarding.steps.firstTask.description',
          'Llevá tus ideas a la acción con una tarea.',
        ),
        done: firstTaskDone,
        ctaLabel: t('onboarding.steps.firstTask.ctaLabel', 'Crear tarea'),
        ctaTo: '/tasks',
      },
    ],
    [apiKeyDone, firstNoteDone, inboxAiDone, firstTaskDone, openCapture, t],
  );

  const completedCount = steps.filter((step) => step.done).length;
  const allComplete = completedCount === steps.length;

  // "Cuenta vacía": sin señales de uso productivo. Reusa los `done` (una sola
  // fuente de verdad) + inbox totalmente vacío, para no mostrar el welcome en
  // un 2º dispositivo a quien ya capturó algo. Solo significativo bajo `ready`.
  const accountIsEmpty =
    !apiKeyDone && !firstNoteDone && !firstTaskDone && Object.keys(inboxTable).length === 0;

  // D2: el welcome solo aparece a cuentas nuevas/vacías. El checklist se gatea
  // por welcomeSeen → un usuario existente (que nunca vio el welcome) jamás ve
  // ninguna de las dos piezas.
  const shouldShowWelcome = ready && !preferences.onboardingWelcomeSeen && accountIsEmpty;

  const shouldShowChecklist =
    ready && preferences.onboardingWelcomeSeen && !preferences.onboardingChecklistDismissed;

  const markWelcomeSeen = useCallback(async () => {
    // Guard D9/isLoaded: no persistir contra defaults pre-snapshot (pisaría el
    // valor real). setPreferences mergea, así que esto es defensa en profundidad.
    if (!user || !prefsLoaded) return;
    await setPreferences(user.uid, { onboardingWelcomeSeen: true });
  }, [user, prefsLoaded]);

  const dismissChecklist = useCallback(async () => {
    if (!user || !prefsLoaded) return;
    await setPreferences(user.uid, { onboardingChecklistDismissed: true });
  }, [user, prefsLoaded]);

  return {
    steps,
    completedCount,
    allComplete,
    shouldShowWelcome,
    shouldShowChecklist,
    markWelcomeSeen,
    dismissChecklist,
  };
}
