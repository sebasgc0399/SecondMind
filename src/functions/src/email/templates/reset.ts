// SPEC-65 F2.5 — email de reset de contraseña (Resend, HTML propio). es-first; el map
// keyed-por-locale deja el punto de extensión a i18n. `link` lo genera la CF al vuelo (Admin SDK
// generatePasswordResetLink). El oobCode de reset vence ~1h → el copy lo menciona.

import { renderLayout } from './layout';

export interface ResetEmailContent {
  subject: string;
  html: string;
  text: string;
}

const COPY = {
  es: {
    subject: 'Restablecé tu contraseña de SecondMind',
    heading: 'Restablecé tu contraseña',
    body: [
      'Recibimos una solicitud para cambiar la contraseña de tu cuenta de SecondMind.',
      'Tocá el botón para elegir una nueva contraseña. El enlace vence en una hora.',
    ],
    cta: 'Cambiar mi contraseña',
    footnote:
      'Si no pediste cambiar tu contraseña, podés ignorar este mensaje: tu contraseña actual sigue siendo válida.',
    textIntro: 'Usá este enlace para elegir una nueva contraseña (vence en una hora):',
  },
};

export function resetEmail(link: string, locale: 'es' = 'es'): ResetEmailContent {
  const c = COPY[locale];
  return {
    subject: c.subject,
    html: renderLayout({
      heading: c.heading,
      body: c.body,
      ctaLabel: c.cta,
      ctaUrl: link,
      footnote: c.footnote,
    }),
    text: ['¡Hola!', '', c.textIntro, link, '', c.footnote, '', '— El equipo de SecondMind'].join(
      '\n',
    ),
  };
}
