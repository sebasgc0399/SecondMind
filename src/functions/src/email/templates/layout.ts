// SPEC-65 F2.5 — layout HTML compartido para los emails de Auth (verify + reset).
// HTML table-based, todo inline-styled: Gmail strip-ea el <style> del <head>, Outlook ignora
// flex/grid, y `color-scheme: light` evita la inversión agresiva del dark mode de algunos
// clientes. El `text` fallback (que arma cada template) es el garante cross-client real.
// NO es un sistema de templating: una sola función que arma el string.

// Hex email-safe derivados de los tokens de la app (src/index.css, hue 285).
const BRAND = {
  purple: '#5b51a8', // ≈ oklch(0.5 0.12 285) = --primary
  ink: '#1f1d2b', // ≈ --foreground
  muted: '#6b6878', // ≈ --muted-foreground
  card: '#ffffff',
  page: '#f5f4f8',
  border: '#e5e3ec',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Escapa para incrustar en HTML (texto y atributos con comillas dobles). El link generado por
// el Admin SDK trae `&` en los query params → `&amp;` para HTML válido (los clientes lo renderizan
// y copian como `&`).
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface LayoutParams {
  heading: string;
  body: readonly string[]; // párrafos
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
}

export function renderLayout({ heading, body, ctaLabel, ctaUrl, footnote }: LayoutParams): string {
  const href = esc(ctaUrl);
  const paragraphs = body
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${esc(
          p,
        )}</p>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${
    BRAND.page
  };">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${
    BRAND.card
  };border:1px solid ${BRAND.border};border-radius:12px;">
<tr><td style="padding:32px 32px 8px;font-family:${FONT};">
<p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${
    BRAND.purple
  };">SecondMind</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${
    BRAND.ink
  };">${esc(heading)}</h1>
${paragraphs}
</td></tr>
<tr><td style="padding:8px 32px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:${
    BRAND.purple
  };">
<a href="${href}" style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(
    ctaLabel,
  )}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 32px 24px;font-family:${FONT};">
<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${
    BRAND.muted
  };">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
<p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:${
    BRAND.purple
  };">${href}</a></p>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid ${BRAND.border};font-family:${FONT};">
<p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:${BRAND.muted};">${esc(footnote)}</p>
<p style="margin:0;font-size:13px;color:${BRAND.muted};">— El equipo de SecondMind</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
