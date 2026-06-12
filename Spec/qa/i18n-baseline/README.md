# Baseline visual pre-F2 — SPEC-feature-58 (i18n)

Capturas Playwright del estado **es** al cierre de F1 (2026-06-11, dev server local,
cuenta real). Contrato visual del gate por dominio de F2: el smoke de cada dominio
compara contra estas capturas — "es visualmente idéntico" es criterio de done.

- **33 PNGs**: 11 pantallas × 3 viewports (375×667 / 768×1024 / 1280×800), a
  resolución de viewport real (DPR 1, no retina).
- Nombre: `<pantalla>-<viewport>.png`.
- **Gap documentado:** `auth-login-*` no se pudo capturar con sesión activa (el
  guard redirige). Se captura con sesión cerrada AL ARRANCAR F2.6 (auth), antes
  de instrumentar ese dominio.
- **Artefacto TEMPORAL del arco i18n**: al cierre de F4.3 se decide explícitamente
  si se conserva o se borra (P9 del SPEC).
