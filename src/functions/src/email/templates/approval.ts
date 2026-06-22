// SPEC-65 F1.3 — copy del aviso de aprobación de postulantes a la beta. Texto plano: el
// postulante todavía NO tiene cuenta, así que no hay generateLink ni oobCode, solo un puntero
// a la app. D2: español siempre (beta curada Spanish-first; el postulante no está autenticado,
// no hay locale del token del cual inferir idioma). El map keyed-por-locale deja el punto de
// extensión para i18n (F2) sin cambiar la firma de los callers.

const APP_URL = 'https://app.getsecondmind.co';

export interface ApprovalEmailContent {
  subject: string;
  text: string;
}

const COPY: Record<'es', ApprovalEmailContent> = {
  es: {
    subject: 'Tu acceso a SecondMind fue aprobado',
    text: [
      '¡Hola!',
      '',
      'Tu solicitud de acceso a la beta de SecondMind fue aprobada.',
      `Entrá o creá tu cuenta con el mismo email en ${APP_URL} y empezá a usar tu segundo cerebro.`,
      '',
      'Si no reconocés esta solicitud, podés ignorar este mensaje.',
      '',
      '— El equipo de SecondMind',
    ].join('\n'),
  },
};

export function approvalEmail(locale: 'es' = 'es'): ApprovalEmailContent {
  return COPY[locale];
}
