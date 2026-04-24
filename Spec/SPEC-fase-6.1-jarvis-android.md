# SPEC — SecondMind · Fase 6.1: Jarvis Android Voice Assistant

> Alcance: Fork, auditoría, customización y build del app Android `openclaw-assistant` como cliente de voz "Jarvis" conectado al gateway OpenClaw en VPS — con wake word offline, VoiceInteractionService, y acceso completo a SecondMind via MCP
> Dependencias: Fase 6 completada (MCP server deployed en Cloud Run + OpenClaw gateway en VPS)
> Estimado: 1 semana (incluye auditoría de código + customización + testing en device)
> Stack relevante: Kotlin, Jetpack Compose, Material 3, Vosk (wake word), Android SpeechRecognizer, OkHttp, Gradle

---

## Objetivo

Al terminar esta fase, Sebastian puede decir "Jarvis" con el teléfono en el bolsillo (o long-press Home), hablarle en español, y recibir respuesta hablada con datos reales de SecondMind — tareas del día, estado de hábitos, crear tareas, briefings — todo hands-free. La app es un build from source del fork, auditado y customizado.

---

## Features

### F1: Fork y Auditoría de Seguridad

**Qué:** Fork del repositorio `yuga-hashimoto/openclaw-assistant` (MIT license) a la cuenta de Sebastian. Auditoría completa del código fuente enfocada en seguridad: networking, manejo de audio, storage de credenciales, y permisos.

**Criterio de done:**
- [ ] Fork creado en la cuenta de Sebastian en GitHub
- [ ] Código clonado localmente y proyecto abre sin errores en Android Studio
- [ ] `./gradlew assembleDebug` compila exitosamente
- [ ] Auditoría de networking completada: verificar que OkHttp solo envía requests al gateway configurado, no a terceros
- [ ] Auditoría de audio completada: verificar que Vosk procesa audio localmente y que el STT solo se activa post-wake-word
- [ ] Auditoría de storage completada: verificar que `EncryptedSharedPreferences` se usa para tokens y URLs
- [ ] Auditoría de permisos completada: verificar que `AndroidManifest.xml` solo declara `RECORD_AUDIO`, `INTERNET`, `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS`
- [ ] Documento de auditoría breve (checklist con hallazgos) guardado en `docs/AUDIT.md` del fork

**Notas de implementación:**
- Fuente: `https://github.com/yuga-hashimoto/openclaw-assistant` — 78 commits, 44 releases, MIT license, Kotlin 100%.
- El desarrollador (yuga-hashimoto) tiene PRs aceptados en el repo oficial de OpenClaw (#30364, #30415). Es contributor activo del ecosistema.
- Revisar en orden de prioridad: (1) clases de networking (`OkHttp` calls — ¿a dónde van los requests?), (2) manejo de audio (`Vosk` init y SpeechRecognizer — ¿cuándo se graba y a dónde se envía?), (3) storage (`EncryptedSharedPreferences` — ¿qué se guarda y cómo?), (4) permisos runtime (¿pide algo que no necesita?).
- Si la auditoría encuentra algo sospechoso → no continuar. Evaluar alternativas (app oficial o Capacitor custom).

---

### F2: Customización de Branding "Jarvis"

**Qué:** Renombrar la app de "OpenClaw Assistant" a "Jarvis", cambiar ícono, colores, y wake word default. Alinear con la identidad visual de SecondMind donde tenga sentido.

**Criterio de done:**
- [ ] App name cambiado a "Jarvis" en `strings.xml` y `AndroidManifest.xml`
- [ ] Ícono de la app reemplazado (reusar brain-circuit icon de SecondMind o variante de Jarvis)
- [ ] Color primario alineado con SecondMind (`#7b2ad1` purple o variante compatible con Material 3)
- [ ] Wake word default cambiado de "Open Claw" a "Jarvis"
- [ ] Textos de UI que digan "OpenClaw" reemplazados por "Jarvis" donde aplique (splash, settings, about)
- [ ] Package name cambiado a `com.secondmind.jarvis` (evita conflicto con la app original si se instala)

**Archivos a modificar (estimados, verificar en auditoría):**
- `app/src/main/res/values/strings.xml` — App name, textos UI
- `app/src/main/res/values/colors.xml` — Color scheme
- `app/src/main/AndroidManifest.xml` — Package name, app label
- `app/build.gradle.kts` — `applicationId` → `com.secondmind.jarvis`
- `app/src/main/res/mipmap-*/` — Íconos de la app (mdpi a xxxhdpi)
- Archivos Compose con hardcoded strings de "OpenClaw"

**Notas de implementación:**
- El ícono se puede generar con el pipeline existente de SecondMind: Recraft AI → SVG → Node.js `sharp` → todos los tamaños de mipmap. O usar Android Studio Image Asset Studio para generar adaptive icons.
- Material 3 usa dynamic color theming. Verificar si la app usa `dynamicColorScheme` o colores estáticos antes de cambiar.
- El cambio de `applicationId` es crítico — sin esto, no se puede instalar junto a la app original.

---

### F3: Configuración de Conexión al VPS

**Qué:** Configurar la app para conectar al gateway OpenClaw que corre en el VPS de Sebastian. Incluye setup de auth, URL del endpoint, y verificación de conectividad end-to-end.

**Criterio de done:**
- [ ] La app conecta al gateway en el VPS via HTTPS (URL pública o Tailscale)
- [ ] Auth token configurado y validado (Bearer token del gateway)
- [ ] Enviar un mensaje de texto desde la app y recibir respuesta del gateway
- [ ] Enviar un mensaje de voz (STT → texto → gateway → respuesta → TTS) funciona end-to-end
- [ ] La app reconecta automáticamente si se pierde conexión (retry/backoff)
- [ ] La latencia es aceptable (<3s desde fin de habla hasta inicio de TTS response)

**Notas de implementación:**

La app soporta dos modos de conexión:
1. **Gateway Chat** — via WebSocket al gateway OpenClaw (puerto 18789 por default). Soporta streaming, sessions, y agent selection. Requiere device pairing (`openclaw devices approve`).
2. **HTTP Chat Completions** — POST directo al endpoint `/v1/chat/completions`. Más simple, no requiere pairing, pero sin streaming.

Para VPS remoto, opciones de exposición:
- **HTTPS directo**: reverse proxy (nginx/Caddy) con SSL cert frente al gateway. La más limpia.
- **Tailscale**: si el teléfono y VPS están en la misma Tailnet, conexión privada sin exponer puerto público.
- **ngrok**: quick and dirty para testing, no para producción (latencia, dominio rotativo en free tier).

Recomendación: **Caddy reverse proxy** en el VPS con dominio propio y SSL automático. Ejemplo:
```
jarvis.tudominio.com {
    reverse_proxy localhost:18789
}
```

Para el MCP de SecondMind: el gateway de OpenClaw se conecta al MCP server de Cloud Run. La app Android NO habla directo con el MCP — habla con el gateway, el gateway habla con MCP. La cadena es:

```
📱 Jarvis App → 🖥️ Gateway (VPS) → 🤖 MiniMax M2.7 → 🔧 MCP Server (Cloud Run) → 🔥 Firestore
```

---

### F4: Configuración de Voz en Español

**Qué:** Configurar STT y TTS para español (Colombia). Verificar que el wake word "Jarvis" se detecta correctamente con acento colombiano.

**Criterio de done:**
- [ ] STT reconoce español hablado con acento colombiano (locale `es-CO` o `es-419`)
- [ ] TTS responde en español con voz natural (Android TTS engine o ElevenLabs si se configura)
- [ ] Wake word "Jarvis" se detecta consistentemente (>80% de las veces) en ambiente normal (no ruidoso)
- [ ] El silence timeout es apropiado para español (no corta frases largas prematuramente)
- [ ] Continuous conversation mode funciona: Jarvis responde → escucha automáticamente la siguiente instrucción

**Notas de implementación:**
- Android `SpeechRecognizer` soporta `es-CO` nativamente. Configurar en settings de la app.
- Vosk para wake word necesita un modelo de español. El modelo default puede ser inglés. Verificar si el wake word "Jarvis" (que suena igual en cualquier idioma) se detecta con el modelo default o si necesita modelo español.
- Si Vosk no detecta "Jarvis" bien con modelo default: (a) probar con modelo español de Vosk (`vosk-model-small-es-0.42`), o (b) cambiar a un wake word más fonéticamente distintivo.
- TTS: el engine nativo de Android (Google TTS) tiene buena calidad en español. ElevenLabs es superior pero requiere API key y cuesta. Empezar con nativo.
- Silence timeout default suele ser 1-2s. Para español conversacional, 2-3s es más natural. Ajustar en settings.

---

### F5: Build, Test y Deploy en Device

**Qué:** Build final del APK desde source, testing completo en el teléfono de Sebastian, y setup como asistente del sistema.

**Criterio de done:**
- [ ] `./gradlew assembleRelease` genera APK firmado (keystore propio, NO el del autor original)
- [ ] APK instalado en el teléfono de Sebastian
- [ ] Wake word "Jarvis" activa la app desde cualquier pantalla (foreground service corriendo)
- [ ] Long-press Home activa Jarvis (VoiceInteractionService configurado como asistente default)
- [ ] "Jarvis, ¿cómo va mi día?" → respuesta hablada con datos reales de SecondMind
- [ ] "Jarvis, creame una tarea: revisar el PR de FuelControl" → tarea visible en secondmind.web.app
- [ ] "Jarvis, ¿qué hábitos me faltan hoy?" → respuesta con lista de hábitos pendientes
- [ ] La app sobrevive reinicios del teléfono (autostart del foreground service)
- [ ] El consumo de batería del wake word listener es aceptable (<5% en un día normal)

**Notas de implementación:**
- **Keystore**: generar un keystore propio con `keytool`. NUNCA usar el keystore del autor original. Guardar el keystore de forma segura (no en el repo).
  ```bash
  keytool -genkey -v -keystore jarvis.keystore -alias jarvis -keyalg RSA -keysize 2048 -validity 10000
  ```
- **Signing config**: configurar en `app/build.gradle.kts` con el keystore propio para release builds.
- **ProGuard/R8**: la app probablemente tiene R8 habilitado para release. Verificar que las keep rules para Vosk y OkHttp están correctas (el autor ya debería tener esto resuelto).
- **Autostart**: Android restringe autostart agresivamente. Verificar que el `BOOT_COMPLETED` receiver funciona en el dispositivo de Sebastian. En algunos fabricantes (Samsung, Xiaomi) hay que agregar la app a la lista blanca de batería manualmente.
- **Testing end-to-end**: probar con los 16 MCP tools de SecondMind, no solo los más comunes. Verificar que tool calls complejos (ej: `get_daily_summary` que agrega 4 colecciones) funcionan sin timeout en la cadena App → Gateway → M2.7 → MCP → Firestore.

---

## Orden de implementación

1. **F1 (Fork + Auditoría)** → Sin esto no hay nada. Si la auditoría falla, se aborta el approach.
2. **F2 (Branding)** → Cambios cosméticos, bajo riesgo. Se puede hacer en paralelo con F3.
3. **F3 (Conexión VPS)** → Requiere que el gateway de Fase 6 esté operativo en el VPS.
4. **F4 (Voz español)** → Depende de F3 (necesita gateway conectado para probar STT → gateway → TTS).
5. **F5 (Build + Deploy)** → Integración final. Depende de todo lo anterior.

---

## Estructura de archivos

```
# Fork en GitHub (com.secondmind.jarvis)
openclaw-assistant/                  # Fork de yuga-hashimoto/openclaw-assistant
├── app/
│   ├── src/main/
│   │   ├── java/com/secondmind/jarvis/   # Package renombrado
│   │   │   ├── ui/                       # Compose UI (branding Jarvis)
│   │   │   ├── service/                  # Wake word, VoiceInteraction
│   │   │   ├── network/                  # OkHttp gateway connection
│   │   │   └── ...
│   │   ├── res/
│   │   │   ├── values/strings.xml        # "Jarvis", textos en español
│   │   │   ├── values/colors.xml         # SecondMind purple theme
│   │   │   └── mipmap-*/                 # Jarvis icon (brain-circuit variant)
│   │   └── AndroidManifest.xml           # Package, permisos, VoiceInteraction
│   └── build.gradle.kts                  # applicationId, signing config
├── docs/
│   └── AUDIT.md                          # Resultados de auditoría de seguridad
├── gradle/
├── build.gradle.kts
├── settings.gradle.kts
└── README.md                             # Setup docs (Jarvis-specific)
```

---

## Definiciones técnicas

### D1: ¿Por qué fork y no build from scratch?

El repo `openclaw-assistant` ya resuelve los problemas más complejos de Android nativo: wake word offline (Vosk integration), VoiceInteractionService (reemplazo de asistente del sistema), foreground service lifecycle, auto-reconnect WebSocket, y EncryptedSharedPreferences. Reimplementar todo esto en Capacitor o React Native tomaría 3-4 semanas y el resultado sería inferior (sin wake word offline, sin VoiceInteractionService). Fork + audit + customize es 1 semana para un resultado superior.

### D2: ¿Por qué build from source y no instalar el APK pre-built?

Seguridad. Un APK pre-built de un repo con 55 stars no se audita — se confía ciegamente. Build from source garantiza que lo que corre en el teléfono es exactamente el código que Sebastian revisó. Además, permite cambiar el `applicationId` y firmar con keystore propio.

### D3: ¿Por qué Caddy y no ngrok para exponer el gateway?

ngrok en free tier rota el dominio, agrega latencia (~100ms), y tiene rate limits. Caddy con un dominio propio da SSL automático, latencia mínima, y URL estable. Para un servicio always-on como un voice assistant, la estabilidad del endpoint es crítica. Costo: ~$10/año por dominio.

### D4: ¿Qué pasa si Vosk no detecta bien "Jarvis" en español?

Opciones ordenadas por esfuerzo:
1. Probar con el modelo default (inglés) — "Jarvis" es fonéticamente similar en todos los idiomas.
2. Descargar modelo español de Vosk (`vosk-model-small-es-0.42`, ~50MB) y configurar.
3. Cambiar wake word a algo más fonéticamente marcado ("Computador", "Segundo").
4. Usar long-press Home como trigger principal y wake word como bonus.

### D5: ¿Cuál es la cadena completa de un voice command?

```
1. 📱 Vosk detecta "Jarvis" (offline, ~0ms)
2. 📱 Android SpeechRecognizer activa STT (~1-2s)
3. 📱 Texto enviado al Gateway via HTTPS/WebSocket
4. 🖥️ Gateway rutea a MiniMax M2.7
5. 🤖 M2.7 decide qué MCP tools llamar
6. 🔧 MCP Server (Cloud Run) ejecuta query a Firestore
7. 🔥 Firestore retorna datos
8. 🤖 M2.7 genera respuesta en texto
9. 🖥️ Gateway envía respuesta a la app
10. 📱 Android TTS lee la respuesta en voz alta
```

Latencia estimada total: 3-5s (dominada por M2.7 inference + cold start de Cloud Run si aplica).

---

## Checklist de completado

Al terminar esta fase, TODAS estas condiciones deben ser verdaderas:

- [ ] Fork del repo existe en la cuenta de Sebastian
- [ ] Auditoría de seguridad completada y documentada en `docs/AUDIT.md`
- [ ] No se encontraron problemas de seguridad bloqueantes
- [ ] App renombrada a "Jarvis" con branding propio
- [ ] APK compilado from source con keystore propio
- [ ] APK instalado en el teléfono de Sebastian
- [ ] Gateway OpenClaw accesible desde internet via HTTPS (Caddy o Tailscale)
- [ ] Wake word "Jarvis" activa la app
- [ ] Long-press Home activa Jarvis
- [ ] STT funciona en español colombiano
- [ ] TTS responde en español
- [ ] "¿Cómo va mi día?" retorna datos reales de SecondMind
- [ ] "Creame una tarea: X" crea la tarea en Firestore, visible en secondmind.web.app
- [ ] Consumo de batería aceptable tras 24h de uso normal
- [ ] La app sobrevive reinicio del teléfono

---

## Gotchas anticipados

1. **Package rename es invasivo.** Cambiar `applicationId` es fácil en Gradle, pero si el código Kotlin tiene imports hardcoded al package original, hay que renombrar directorios y actualizar imports. Android Studio tiene "Refactor → Move" para esto.
2. **Vosk model size.** El modelo de wake word de Vosk puede ser 50-200MB dependiendo del idioma. Verificar que no infle demasiado el APK. Alternativa: descargar el modelo on first launch.
3. **Battery optimization hell.** Samsung, Xiaomi, Huawei tienen restricciones agresivas que matan foreground services. La app necesita whitelisting manual en configuración de batería. Documentar los pasos para el device específico de Sebastian.
4. **Cold start de Cloud Run en la cadena.** Si Cloud Run escala a 0, el primer voice command del día puede tardar 5-8s (cold start container + M2.7 inference). Si molesta, subir min instances a 1 en Cloud Run.
5. **STT requiere internet.** Android SpeechRecognizer usa Google Cloud STT por default. Sin internet, el wake word funciona (Vosk offline) pero el STT no. No hay workaround fácil excepto Whisper local (heavy para mobile).
6. **TTS en español puede sonar robótico.** Google TTS ha mejorado mucho, pero si la voz no es satisfactoria, ElevenLabs ofrece voces mucho más naturales. Costo: ~$5/mes en el plan Creator.
7. **Gateway auth en transit.** El token Bearer viaja en cada request. Asegurar que la conexión al VPS es HTTPS (Caddy + cert) o vía Tailscale. Nunca HTTP plano.
8. **Wear OS.** La app soporta Wear OS pero es un bonus, no un requisito. Si Sebastian tiene smartwatch Android, puede probarlo después sin cambios adicionales.

---

## Siguiente fase

Con Fase 6.1 completada, Sebastian tiene un asistente de voz personal que funciona como Siri/Bixby pero conectado a su propio sistema. Las iteraciones naturales serían:

- **Widgets Android** — Widget de home screen que muestra el último briefing o las tareas del día, sin abrir la app
- **Quick actions por voz** — Shortcuts predefinidos ("Jarvis, modo focus" → silencia notificaciones + crea tarea de concentración)
- **Notificación proactiva** — El gateway envía push al teléfono cuando un briefing scheduled se genera (complemento al messaging channel)
- **Multi-device** — Mismo gateway, múltiples devices (teléfono + tablet + watch)
