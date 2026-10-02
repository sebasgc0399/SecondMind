# SPEC — Etapa <N>: <nombre>

> **Estado:** Borrador | En curso (rama `<rama>`) | Cerrada.
> **Origen / autorización:** <de dónde sale la etapa, quién la autorizó y cuándo, con la cita textual si existe. Si el loop autónomo está autorizado, decirlo acá: etapa, rama, "commits y tags locales; push no".>
> **Etiquetas:** locales `e<N>-T<n>`. **Nunca** `v*` (dispara `release.yml`). Sin push dentro de la etapa; el merge a `main` lo hace Sebastián al revisar.
> **Rama:** `feat/<nombre-corto>`.

---

## Objetivo

<Qué tiene que ser posible al terminar la etapa y por qué hoy no lo es. Si hay mediciones previas, citarlas.>

## Invariantes

Lo que ninguna tanda puede romper. El revisor los usa como vara.

- **I1 — <nombre>.** <regla verificable>
- **I2 — <nombre>.** <regla verificable>

## Plan por tandas

| Id     | Objetivo | Áreas                 | Tamaño | Riesgo          | Depende |
| ------ | -------- | --------------------- | ------ | --------------- | ------- |
| **T1** | <...>    | <archivos o carpetas> | ~<N>   | Bajo/Medio/Alto | —       |
| **T2** | <...>    | <archivos o carpetas> | ~<N>   | Bajo/Medio/Alto | T1      |

Una tanda es una unidad chica y verificable (~300–800 líneas). Los riesgos altos los escribe un modelo fuerte.

### T1 — <nombre>

- **Qué:** <qué se construye>.
- **Fuentes de verdad:** <secciones del SPEC, docs, archivos:línea>.
- **Criterio de cierre:** <comando o chequeo observable>.
- **Control positivo:** <qué mutación o caso prohibido debe hacer fallar cada chequeo nuevo>.
- **Mirar con lupa (revisor):** <riesgos concretos que se ven venir>.

### T2 — <nombre>

_(mismo formato)_

## Verificación de la etapa

- <Comando de la suite segura> verde en la rama.
- <Demostraciones manuales o de integración que cierran la etapa>.

## Avance

Una entrada por tanda. Formato:

### T<n> — <nombre> (`e<N>-T<n>` | en curso)

- **Qué se hizo:** <resumen en 2–4 líneas>.
- **Commits:** `<hash>` <asunto>; ...
- **Verificación:** `<comando>: <resultado con números>` (una línea por comando; incluir el control positivo observado).
- **Revisión:** veredicto (`APROBADA` / `APROBADA CON CORRECCIONES` / `RECHAZADA`) + hallazgos (severidad, `archivo:línea`, una línea cada uno).
- **Correcciones:** qué se aplicó, y desviaciones con su evidencia.
- **Pendientes:** seguimientos conocidos que no entran en esta tanda.

## Decisiones del juez (a ratificar)

Dudas técnicas que se resolvieron contra el SPEC y los invariantes. Sebastián las confirma o las revierte al cierre.

- **E<N>-T<n>-a — <decisión>.** Porqué: <razón concreta>.

## Estacionadas para Sebastián

Decisiones visuales o de producto. La tanda siguió con lo que ya había.

- **<tema>.** Contexto: <qué pasa y dónde>. Opciones: (A) <...> (B) <...>. Recomendación: <...>.

## Pasos manuales de Sebastián

Lo que solo un humano puede verificar (entrada real, lector de pantalla, aspecto visual).

1. <Paso concreto con comando o clic>.
   **Qué deberías ver:** <resultado observable>.

## Resumen de cierre

_(lo escribe el autor de la última tanda)_

- **Etiquetas:** `e<N>-T1` … `e<N>-T<n>`.
- **Decisiones a ratificar:** <lista>.
- **Estacionadas:** <lista>.
- **Seguimientos conocidos:** <lista>.
