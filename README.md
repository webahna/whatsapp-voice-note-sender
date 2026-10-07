# WhatsApp Voice Note Sender

Proyecto en Node.js para enviar archivos de audio pregrabados a WhatsApp como **notas de voz (PTT)** utilizando Baileys.

El proyecto convierte automáticamente el audio a **OGG/Opus**, calcula su duración, genera un **waveform de 64 muestras** y construye directamente el `AudioMessage` de WhatsApp para que el archivo aparezca como una nota de voz normal, incluyendo sus ondas de audio.

## Características

- Envía audios pregrabados como notas de voz.
- Convierte automáticamente el audio a OGG/Opus.
- Genera el waveform real del audio.
- Muestra las ondas de audio en WhatsApp.
- Calcula automáticamente la duración.
- Solicita el número y archivo desde la terminal.
- Mantiene iniciada la sesión de WhatsApp.
- Resuelve automáticamente el JID del destinatario.
- Compatible con cualquier sistema que pueda ejecutar Node.js y FFmpeg.

---

## Requisitos

Necesitas tener instalado:

- Node.js
- npm
- FFmpeg
- FFprobe
- Git (opcional, para clonar el repositorio)

El proyecto fue desarrollado y probado utilizando:

```text
Node.js
@whiskeysockets/baileys 6.7.24
FFmpeg
```

Se recomienda mantener Baileys en la versión:

```text
6.7.24
```

ya que es la versión con la que se comprobó el funcionamiento del envío de notas de voz y waveform.

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone URL_DEL_REPOSITORIO
cd whatsapp-voz
```

También puedes descargar el repositorio manualmente.

### 2. Instalar dependencias

Si el proyecto contiene `package.json` y `package-lock.json`:

```bash
npm install
```

Si necesitas instalar las dependencias manualmente:

```bash
npm install @whiskeysockets/baileys@6.7.24
npm install qrcode-terminal
```

### 3. Comprobar FFmpeg

Ejecuta:

```bash
ffmpeg -version
```

y:

```bash
ffprobe -version
```

Ambos comandos deben estar disponibles desde la terminal.

---

# Vincular WhatsApp

La primera vez es necesario vincular el programa con tu cuenta de WhatsApp.

Ejecuta:

```bash
node index.js
```

El programa mostrará un código QR.

En WhatsApp abre:

```text
Configuración/Ajustes
→ Dispositivos vinculados
→ Vincular un dispositivo
```

Escanea el QR.

Después de vincular la cuenta se creará:

```text
auth/
```

Esta carpeta contiene la sesión de WhatsApp.

En las siguientes ejecuciones no será necesario volver a escanear el QR mientras la sesión siga siendo válida.

---

# IMPORTANTE: proteger la sesión

Nunca subas:

```text
auth/
```

a GitHub.

El `.gitignore` debería contener:

```gitignore
node_modules/
auth/
audio_temp_*.ogg
.env
```

La carpeta `auth/` contiene credenciales de la sesión de WhatsApp y debe mantenerse privada.

---

# Enviar una nota de voz

Ejecuta:

```bash
node enviar.js
```

El programa solicitará:

```text
Numero de WhatsApp:
```

Introduce el número completo incluyendo código de país.

Ejemplo:

```text
526682348809
```

Después solicitará:

```text
Ruta del archivo de audio:
```

Introduce la ruta absoluta o válida para tu sistema operativo.

### Windows

Por ejemplo:

```text
C:\Users\Usuario\Downloads\audio.mp3
```

### Linux/macOS

Por ejemplo:

```text
/home/usuario/Downloads/audio.mp3
```

El script procesará y enviará automáticamente el audio.

---

# Funcionamiento

El proceso completo es:

```text
Archivo de audio
       │
       ▼
     FFmpeg
       │
       ▼
    OGG/Opus
       │
       ├──────────────► Duración
       │
       ▼
Conversión temporal a PCM
       │
       ▼
Análisis de amplitud
       │
       ▼
Waveform de 64 muestras
       │
       ▼
prepareWAMessageMedia()
       │
       ▼
AudioMessage
       │
       ├── ptt: true
       ├── seconds
       └── waveform
       │
       ▼
generateWAMessageFromContent()
       │
       ▼
relayMessage()
       │
       ▼
WhatsApp Voice Note
```

---

# Conversión de audio

Antes de enviarse, FFmpeg convierte el archivo a:

```text
Formato: OGG
Codec: Opus
Canales: Mono
Sample rate: 48000 Hz
Bitrate: 32 kbps
Application: VOIP
```

Equivalente aproximadamente a:

```bash
ffmpeg \
  -i audio.mp3 \
  -vn \
  -ac 1 \
  -ar 48000 \
  -c:a libopus \
  -b:a 32k \
  -application voip \
  audio.ogg
```

---

# Generación del waveform

El waveform se genera directamente a partir del audio utilizando FFmpeg.

Para analizarlo, el audio se convierte temporalmente a:

```text
PCM Signed 16-bit
Mono
8000 Hz
```

El audio completo se divide en:

```text
64 secciones
```

Se calcula la amplitud de cada sección y se normalizan los valores.

Ejemplo:

```javascript
[
  36, 72, 66, 69, 42, 49, 50, 72,
  47, 70, 65, 16, 77, 47, 70, 77,
  ...
]
```

Finalmente:

```javascript
const waveform = Buffer.from(valores);
```

El resultado debe contener:

```text
64 bytes
```

---

# Importante: envío del waveform

Durante el desarrollo se encontró que utilizar solamente:

```javascript
sock.sendMessage(jid, {
    audio: audioBuffer,
    mimetype: "audio/ogg; codecs=opus",
    ptt: true,
    waveform
});
```

podía enviar correctamente el audio como PTT, pero WhatsApp mostraba el waveform como una **línea plana**.

Por este motivo el proyecto construye directamente el `AudioMessage`.

Primero se prepara y sube el archivo:

```javascript
const media = await prepareWAMessageMedia(
    {
        audio: audioBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true
    },
    {
        upload: sock.waUploadToServer
    }
);
```

Después se modifica directamente:

```javascript
const audioMessage = {
    ...media.audioMessage,

    mimetype: "audio/ogg; codecs=opus",

    ptt: true,

    seconds: duracion,

    waveform
};
```

Posteriormente se construye el mensaje:

```javascript
const mensaje = generateWAMessageFromContent(
    jid,
    {
        audioMessage
    },
    {
        userJid: sock.user.id
    }
);
```

Y finalmente se envía:

```javascript
await sock.relayMessage(
    jid,
    mensaje.message,
    {
        messageId: mensaje.key.id
    }
);
```

Este método fue el que permitió que WhatsApp mostrara correctamente las ondas de la nota de voz.

---

# Resolución del número de WhatsApp

No se recomienda construir manualmente:

```text
numero@s.whatsapp.net
```

El proyecto utiliza:

```javascript
sock.onWhatsApp(numero)
```

y obtiene el JID real:

```javascript
const resultado = await sock.onWhatsApp(numero);

const jid = resultado[0].jid;
```

Esto es importante porque el JID interno utilizado por WhatsApp puede no coincidir exactamente con el número introducido.

Por ejemplo, un número mexicano puede introducirse como:

```text
526682348809
```

y WhatsApp puede devolver un JID como:

```text
5216682348809@s.whatsapp.net
```

Siempre debe utilizarse el JID devuelto por WhatsApp.

---

# Salida esperada

Una ejecución correcta debería mostrar algo similar:

```text
🎤 ENVIAR AUDIO COMO NOTA DE VOZ

Numero de WhatsApp: 526682348809
Ruta del archivo de audio: audio.mp3

🔄 Convirtiendo a OGG/Opus...
✓ Audio convertido

⏱️ Calculando duracion...
✓ Duracion: 72 segundos

〰️ Generando waveform...
✓ Waveform generado: 64 muestras

✓ WhatsApp conectado

🔎 Buscando numero...
✓ JID encontrado

☁️ Subiendo audio a WhatsApp...
✓ Audio subido

🔬 VERIFICACION FINAL
ptt: true
seconds: 72
waveform: 64

🎤 Enviando...

✅ NOTA DE VOZ ENVIADA
✓ Duracion: 72 segundos
✓ Waveform: 64 muestras
```

---

# Problemas comunes

## `ffmpeg` no se reconoce como comando

FFmpeg no está instalado o no se encuentra en el `PATH` del sistema.

Comprueba:

```bash
ffmpeg -version
```

También:

```bash
ffprobe -version
```

---

## El archivo de audio no existe

Utiliza una ruta válida para el sistema operativo.

Windows:

```text
C:\Users\Usuario\Downloads\audio.mp3
```

Linux/macOS:

```text
/home/usuario/Downloads/audio.mp3
```

---

## El waveform aparece como una línea plana

Comprueba primero:

```text
Waveform generado: 64 muestras
```

Después debe aparecer:

```text
VERIFICACION FINAL
waveform: 64
```

El proyecto debe utilizar:

```text
prepareWAMessageMedia()
        ↓
AudioMessage.waveform
        ↓
generateWAMessageFromContent()
        ↓
relayMessage()
```

No reemplazar este flujo por un `sendMessage()` convencional sin comprobar nuevamente el funcionamiento del waveform.

---

## `Bad MAC` o `No matching sessions found`

Baileys puede mostrar errores como:

```text
Failed to decrypt message with any known session
Bad MAC
No matching sessions found for message
```

Estos mensajes pueden estar relacionados con el descifrado de mensajes recibidos y no necesariamente con el envío de la nota de voz.

Si finalmente aparece:

```text
✅ NOTA DE VOZ ENVIADA
```

comprueba WhatsApp antes de asumir que el envío falló.

---

# Estructura del proyecto

```text
whatsapp-voz/
│
├── index.js
├── enviar.js
├── package.json
├── package-lock.json
├── README.md
├── .gitignore
│
└── auth/              # PRIVADO - NO SUBIR
```

---

# Restaurar el proyecto en el futuro

Si vuelves al proyecto en otra computadora:

```bash
git clone URL_DEL_REPOSITORIO
cd whatsapp-voz
npm install
```

Instala FFmpeg si todavía no está instalado.

Después ejecuta:

```bash
node index.js
```

para vincular tu cuenta de WhatsApp.

Finalmente:

```bash
node enviar.js
```

para enviar audios.

## Recomendación

Conserva en el repositorio:

```text
package.json
package-lock.json
```

El `package-lock.json` es especialmente importante para poder recuperar versiones de dependencias compatibles con el proyecto en el futuro.

---

# Seguridad

Antes de subir cambios:

```bash
git status
```

Verifica que nunca aparezcan archivos dentro de:

```text
auth/
```

Tampoco publiques credenciales, claves de sesión ni información privada.

---

# Disclaimer

Este proyecto utiliza Baileys, una implementación no oficial del protocolo de WhatsApp Web.

El proyecto no está afiliado, autorizado ni respaldado por WhatsApp o Meta.

Cambios futuros en WhatsApp o Baileys pueden romper funcionalidades y requerir modificaciones en el código.