# 🧠 Fundamentos — Segundo Cerebro Digital

> Base teórica para diseñar y construir un Second Brain desde código.
> Fuentes: Building a Second Brain (Tiago Forte), Zettelkasten (Niklas Luhmann), y experiencia propia con Notion.

---

## 1. El problema que resolvemos

Tu cerebro es excelente para **tener ideas**, pésimo para **almacenarlas**.

Sin un sistema externo:

- Las ideas se pierden minutos después de tenerlas
- La información que consumes (libros, podcasts, reuniones, conversaciones) se evapora
- Repites investigaciones que ya hiciste
- No conectas conocimiento entre dominios distintos
- Las decisiones se toman sin contexto histórico

Un segundo cerebro no es un archivo — es una **extensión funcional de tu pensamiento**.

---

## 2. CODE — El framework de Tiago Forte

El ciclo completo de gestión del conocimiento personal:

### Capture (Capturar)

> "Tu trabajo no es crear — es capturar lo que resuena."

- Captura todo lo que te genera una reacción: sorpresa, utilidad, curiosidad, desacuerdo
- No filtres al capturar — filtra después
- La captura debe ser **frictionless**: si toma más de 10 segundos, no lo vas a hacer
- Fuentes: conversaciones, lecturas, podcasts, ideas propias, transcripciones, código, errores resueltos

### Organize (Organizar)

> "No organices por tema. Organiza por accionabilidad."

- **PARA**: Projects, Areas, Resources, Archive
  - **Projects**: tienen deadline y resultado claro (finitos)
  - **Areas**: responsabilidades permanentes sin fecha de fin
  - **Resources**: temas de interés (referencia futura)
  - **Archive**: todo lo inactivo
- La pregunta clave al organizar: **"¿Para qué proyecto o área me sirve esto AHORA?"**
- Si no sirve para nada activo → Resources o Archive
- Organizar no es categorizar por tema — es decidir dónde será útil

### Distill (Destilar)

> "Una nota que no puedes escanear en 30 segundos es una nota muerta."

- **Progressive Summarization**: cada vez que revisitas una nota, la resumes más
  - Nivel 0: nota original completa
  - Nivel 1: pasajes resaltados (bold)
  - Nivel 2: los highlights más importantes (highlight)
  - Nivel 3: resumen ejecutivo en tus propias palabras (arriba de la nota)
- No destiles todo de una vez — hazlo cuando necesites la nota
- El objetivo es que tu "yo del futuro" pueda usar la nota en 30 segundos

### Express (Expresar)

> "El conocimiento solo tiene valor cuando se usa."

- El segundo cerebro no es para acumular — es para **producir**
- Cada proyecto, documento, decisión o conversación se alimenta de notas existentes
- "Intermediate Packets": fragmentos reutilizables (listas, resúmenes, frameworks, plantillas)
- Nunca empiezas de cero — siempre empiezas de tus notas

---

## 3. Notas Atómicas (Zettelkasten)

### Principio fundamental

> Una nota = una idea. No más.

### Reglas

1. **Atómica**: cada nota contiene UNA sola idea o concepto
2. **Autónoma**: se entiende sin necesidad de leer otra nota
3. **Título = la idea**: el título debe expresar la idea, no el tema
   - ❌ "Notas sobre productividad"
   - ✅ "La fricción mata los hábitos más que la falta de motivación"
4. **Conectada**: cada nota debe linkear al menos a otra nota relacionada
5. **En tus palabras**: nunca copies textualmente — reformula con tu entendimiento
6. **Fechada y atribuida**: cuándo la creaste, de dónde viene la idea

### Tipos de notas en Zettelkasten

- **Fleeting notes**: captura rápida, sin procesar (inbox)
- **Literature notes**: resúmenes de lo que consumes (libros, podcasts, artículos)
- **Permanent notes**: ideas destiladas, en tus palabras, atómicas y conectadas

### El poder de los links

- Los links bidireccionales crean un **grafo de conocimiento**
- Las ideas se descubren por proximidad — "¿qué otras notas linkeé desde aquí?"
- Con el tiempo, emergen **clusters** de conocimiento que no planeaste
- El grafo reemplaza las carpetas: no necesitas una jerarquía perfecta si todo está conectado

---

## 4. Flujo: Captura → Procesamiento → Uso

```
CAPTURA (rápida, sin fricción)
    │
    ▼
INBOX (todo cae aquí primero)
    │
    ▼
PROCESAMIENTO (clasificar + destilar)
    │
    ├──→ ¿Es accionable? → Tarea / Proyecto / Objetivo
    ├──→ ¿Es conocimiento? → Nota atómica + links
    ├──→ ¿Es referencia? → Resource / Archive
    └──→ ¿No sirve? → Eliminar
    │
    ▼
USO (expresar, producir, decidir)
    │
    ├──→ Alimentar proyectos activos
    ├──→ Tomar decisiones informadas
    ├──→ Crear contenido
    └──→ Resurfacing automático (AI)
```

### El rol de la AI en este flujo

- **Captura**: transcribir reuniones, extraer ideas clave de textos largos
- **Procesamiento**: sugerir clasificación, detectar conexiones con notas existentes, generar resúmenes
- **Resurfacing**: "Basado en lo que estás trabajando hoy, estas 3 notas podrían ser relevantes"
- **Expresión**: ayudar a sintetizar notas en documentos, presentaciones, decisiones

---

## 5. Principios de diseño para el sistema

Estos principios deben guiar TODA decisión de diseño del software:

### P1: Captura en menos de 5 segundos

Si capturar una idea toma más de 5 segundos, el sistema falla. La captura rápida es la feature más importante.

### P2: El Inbox es sagrado

Todo entra por el Inbox. Nada se organiza al momento de capturar. Capturar y organizar son dos momentos distintos.

### P3: Las notas son ciudadanos de primera clase

No son adjuntos de tareas ni comentarios en proyectos. Las notas VIVEN por sí solas, se conectan entre sí, y se vinculan a proyectos/áreas cuando aplica.

### P4: Links sobre carpetas

La estructura principal es el grafo de conexiones, no una jerarquía de carpetas. PARA es para accionabilidad, los links son para conocimiento.

### P5: Destilación progresiva

Las notas mejoran con el uso, no al crearlas. El sistema debe facilitar resumir y refinar cada vez que tocas una nota.

### P6: AI como copiloto, no como piloto

La AI sugiere, conecta, resume y resurfacea. El humano decide, edita y crea. Nunca automatizar la decisión final.

### P7: Simplicidad radical

Cada feature debe pasar el test: "¿Lo voy a usar todos los días?" Si la respuesta es no, no entra en v1.

### P8: Offline-first mindset

Las ideas llegan sin wifi. La captura debe funcionar siempre — sync después.

### P9: El sistema se adapta al usuario

No al revés. Si algo no se usa después de 2 semanas, se elimina.

### P10: Producir > Acumular

El sistema debe facilitar USAR las notas, no solo guardarlas. Si las notas no vuelven a ti, el sistema fracasó.

---

## 6. Lecciones aprendidas del SC en Notion

Después de meses usando un Segundo Cerebro en Notion, estas son las lecciones que deben informar el nuevo sistema:

### Lo que funcionó

- Estructura PARA para organizar proyectos y tareas
- Dashboard centralizado como punto de entrada único
- Habit Tracker con checks diarios
- Vincular tareas a proyectos y áreas

### Lo que no funcionó

- Las notas entran y mueren — no hay resurfacing
- No hay conexiones entre notas (solo relaciones a proyectos)
- La captura en Notion es lenta (abrir app → navegar → crear)
- El Inbox se acumula porque procesarlo es tedioso
- Los campos innecesarios agregan fricción
- No hay forma de "pensar" con las notas — solo almacenarlas

### Lo que el nuevo sistema debe resolver

- Captura instantánea desde cualquier contexto
- Notas conectadas entre sí (grafo, no carpetas)
- AI que procese el inbox automáticamente
- Resurfacing inteligente basado en contexto
- Progressive summarization nativa
- Que la información capturada realmente se REUTILICE

---

## 7. Referencias

- **Building a Second Brain** — Tiago Forte (2022)
- **How to Take Smart Notes** — Sönke Ahrens (2017) — sobre Zettelkasten
- **Zettelkasten Method** — Niklas Luhmann (sistema original con fichas físicas)
- **PARA Method** — Tiago Forte (framework de organización)
- **Progressive Summarization** — Tiago Forte (técnica de destilación)
- **Evergreen Notes** — Andy Matuschak (variante moderna de notas atómicas)

---

> **Siguiente paso**: Tomar estos principios y convertirlos en decisiones de arquitectura y features concretas para el proyecto (SPEC.md).
