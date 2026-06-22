// SPEC-65 F2.5 — email de verificación de cuenta (Resend, HTML propio). Reusa el wording
// español del template nativo de Firebase ("Activá tu cuenta de SecondMind"). es-first (beta
// curada Spanish-first); el map keyed-por-locale deja el punto de extensión a i18n sin cambiar
// la firma. `link` lo genera la CF al vuelo (Admin SDK generateEmailVerificationLink).

import { renderLayout } from './layout';

export interface VerifyEmailContent {
  subject: string;
  html: string;
  text: string;
}

const COPY = {
  es: {
    subject: 'Activá tu cuenta de SecondMind',
    heading: 'Activá tu cuenta',
    body: [
      '¡Hola! Gracias por sumarte a SecondMind.',
      'Confirmá tu dirección de email para activar tu cuenta y empezar a usar tu segundo cerebro.',
    ],
    cta: 'Verificar mi email',
    footnote: 'Si no creaste una cuenta en SecondMind, podés ignorar este mensaje.',
    textIntro: 'Confirmá tu email para activar tu cuenta de SecondMind:',
  },
};

// `link` primero (requerido); `locale` con default — TS prohíbe un requerido tras un opcional.
export function verifyEmail(link: string, locale: 'es' = 'es'): VerifyEmailContent {
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
