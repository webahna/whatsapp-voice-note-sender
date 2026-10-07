const {
  default: makeWASocket,
  useMultiFileAuthState,
  prepareWAMessageMedia,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

const { execFileSync } = require("child_process");
const fs = require("fs");
const readline = require("readline");
const path = require("path");
const os = require("os");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function preguntar(texto) {
  return new Promise(resolve => rl.question(texto, resolve));
}


// =====================================================
// LIMPIAR RUTA
// =====================================================

function limpiarRuta(ruta) {

  ruta = ruta
    .trim()
    .replace(/^["']|["']$/g, "");

  if (ruta === "~") {
    return os.homedir();
  }

  if (ruta.startsWith("~/")) {
    return path.join(os.homedir(), ruta.slice(2));
  }

  return ruta;
}


// =====================================================
// DURACION
// =====================================================

function obtenerDuracion(archivo) {

  const resultado = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      archivo
    ],
    {
      encoding: "utf8"
    }
  );

  return Math.max(
    1,
    Math.round(
      parseFloat(resultado.trim())
    )
  );
}


// =====================================================
// GENERAR WAVEFORM CON FFMPEG
// =====================================================

function generarWaveform(archivo) {

  const pcm = execFileSync(
    "ffmpeg",
    [
      "-v", "error",
      "-i", archivo,

      "-ac", "1",
      "-ar", "8000",

      "-f", "s16le",
      "-acodec", "pcm_s16le",

      "pipe:1"
    ],
    {
      encoding: null,
      maxBuffer: 100 * 1024 * 1024
    }
  );

  const totalSamples =
    Math.floor(pcm.length / 2);

  if (totalSamples === 0) {
    throw new Error(
      "El audio no contiene muestras."
    );
  }

  const NUM_BARRAS = 64;

  const amplitudes = [];

  for (
    let barra = 0;
    barra < NUM_BARRAS;
    barra++
  ) {

    const inicio = Math.floor(
      barra *
      totalSamples /
      NUM_BARRAS
    );

    const fin = Math.floor(
      (barra + 1) *
      totalSamples /
      NUM_BARRAS
    );

    let suma = 0;
    let cantidad = 0;

    for (
      let i = inicio;
      i < fin;
      i++
    ) {

      const muestra =
        pcm.readInt16LE(i * 2);

      suma +=
        Math.abs(muestra / 32768);

      cantidad++;
    }

    const promedio =
      cantidad > 0
        ? suma / cantidad
        : 0;

    amplitudes.push(promedio);
  }

  const maximo =
    Math.max(...amplitudes);

  if (maximo <= 0) {
    return Buffer.alloc(64, 0);
  }

  const valores =
    amplitudes.map(valor => {

      const normalizado =
        valor / maximo;

      return Math.max(
        0,
        Math.min(
          100,
          Math.floor(
            normalizado * 100
          )
        )
      );
    });

  return Buffer.from(valores);
}


// =====================================================
// MAIN
// =====================================================

async function main() {

  console.log(
    "\n🎤 ENVIAR AUDIO COMO NOTA DE VOZ\n"
  );

  let numero =
    await preguntar(
      "Numero de WhatsApp (ej. 526681940855): "
    );

  let audio =
    await preguntar(
      "Ruta del archivo de audio: "
    );

  numero =
    numero
      .trim()
      .replace(/\D/g, "");

  audio =
    limpiarRuta(audio);


  // ===================================================
  // COMPROBAR ARCHIVO
  // ===================================================

  if (!fs.existsSync(audio)) {

    console.log(
      "\n❌ No existe el archivo:"
    );

    console.log(audio);

    rl.close();

    return;
  }


  // ===================================================
  // ARCHIVO TEMPORAL
  // ===================================================

  const audioOpus =
    path.join(
      __dirname,
      `audio_temp_${Date.now()}.ogg`
    );


  // ===================================================
  // CONVERTIR
  // ===================================================

  console.log(
    "\n🔄 Convirtiendo a OGG/Opus..."
  );

  try {

    execFileSync(
      "ffmpeg",
      [
        "-y",

        "-i", audio,

        "-vn",

        "-ac", "1",

        "-ar", "48000",

        "-c:a", "libopus",

        "-b:a", "32k",

        "-application", "voip",

        audioOpus
      ],
      {
        stdio: "ignore"
      }
    );

  } catch (error) {

    console.log(
      "\n❌ Error convirtiendo audio."
    );

    rl.close();

    return;
  }

  console.log(
    "✓ Audio convertido"
  );


  // ===================================================
  // DURACION
  // ===================================================

  console.log(
    "\n⏱️ Calculando duracion..."
  );

  const duracion =
    obtenerDuracion(audioOpus);

  console.log(
    `✓ Duracion: ${duracion} segundos`
  );


  // ===================================================
  // WAVEFORM
  // ===================================================

  console.log(
    "\n〰️ Generando waveform..."
  );

  const waveform =
    generarWaveform(audioOpus);

  console.log(
    `✓ Waveform generado: ${waveform.length} muestras`
  );

  console.log(
    "\nWaveform:"
  );

  console.log(
    Array.from(waveform)
  );


  // ===================================================
  // SESION
  // ===================================================

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      "./auth"
    );

  const sock =
    makeWASocket({
      auth: state
    });

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  let enviado = false;


  // ===================================================
  // CONEXION
  // ===================================================

  sock.ev.on(
    "connection.update",

    async ({ connection }) => {

      if (
        connection !== "open" ||
        enviado
      ) {
        return;
      }

      enviado = true;

      console.log(
        "\n✓ WhatsApp conectado"
      );

      try {

        // =============================================
        // BUSCAR NUMERO
        // =============================================

        console.log(
          "\n🔎 Buscando numero..."
        );

        const resultado =
          await sock.onWhatsApp(numero);

        if (
          !resultado ||
          resultado.length === 0
        ) {

          throw new Error(
            "WhatsApp no encontro ese numero."
          );
        }

        const jid =
          resultado[0].jid;

        console.log(
          `✓ JID: ${jid}`
        );


        // =============================================
        // LEER AUDIO
        // =============================================

        const audioBuffer =
          fs.readFileSync(audioOpus);


        // =============================================
        // SUBIR AUDIO A WHATSAPP
        // =============================================

        console.log(
          "\n☁️ Subiendo audio a WhatsApp..."
        );

        const media =
          await prepareWAMessageMedia(
            {
              audio: audioBuffer,

              mimetype:
                "audio/ogg; codecs=opus",

              ptt: true
            },
            {
              upload:
                sock.waUploadToServer
            }
          );


        if (!media.audioMessage) {

          throw new Error(
            "Baileys no genero audioMessage."
          );
        }


        console.log(
          "✓ Audio subido"
        );


        // =============================================
        // MODIFICAR AUDIOMESSAGE DIRECTAMENTE
        // =============================================

        const audioMessage = {
          ...media.audioMessage,

          mimetype:
            "audio/ogg; codecs=opus",

          ptt: true,

          seconds:
            duracion,

          waveform:
            waveform
        };


        console.log(
          "\n🔬 AudioMessage:"
        );

        console.log(
          "PTT:",
          audioMessage.ptt
        );

        console.log(
          "Duracion:",
          audioMessage.seconds
        );

        console.log(
          "Waveform:",
          audioMessage.waveform
            ? audioMessage.waveform.length
            : 0,
          "muestras"
        );


        // =============================================
        // GENERAR MENSAJE WA
        // =============================================

        const mensaje =
          generateWAMessageFromContent(
            jid,

            {
              audioMessage:
                audioMessage
            },

            {
              userJid:
                sock.user.id
            }
          );


        if (
          !mensaje.message ||
          !mensaje.message.audioMessage
        ) {

          throw new Error(
            "No se genero AudioMessage."
          );
        }


        // =============================================
        // VERIFICAR ANTES DE ENVIAR
        // =============================================

        const audioFinal =
          mensaje.message.audioMessage;


        console.log(
          "\n🔬 VERIFICACION FINAL"
        );

        console.log(
          "ptt:",
          audioFinal.ptt
        );

        console.log(
          "seconds:",
          audioFinal.seconds
        );

        console.log(
          "waveform:",
          audioFinal.waveform
            ? audioFinal.waveform.length
            : 0
        );


        // =============================================
        // RELAY DIRECTO
        // =============================================

        console.log(
          `\n🎤 Enviando a ${numero}...`
        );


        await sock.relayMessage(
          jid,

          mensaje.message,

          {
            messageId:
              mensaje.key.id
          }
        );


        console.log(
          "\n✅ NOTA DE VOZ ENVIADA"
        );

        console.log(
          `✓ Duracion: ${duracion} segundos`
        );

        console.log(
          `✓ Waveform: ${waveform.length} muestras`
        );

        console.log(
          `✓ ID: ${mensaje.key.id}`
        );


      } catch (error) {

        console.log(
          "\n❌ ERROR:"
        );

        console.error(error);

      } finally {

        // =============================================
        // LIMPIAR
        // =============================================

        if (
          fs.existsSync(audioOpus)
        ) {

          fs.unlinkSync(
            audioOpus
          );
        }

        rl.close();

        setTimeout(
          () => {
            process.exit(0);
          },
          3000
        );
      }
    }
  );
}


// =====================================================
// ERROR GENERAL
// =====================================================

main().catch(error => {

  console.log(
    "\n❌ ERROR GENERAL:"
  );

  console.error(error);

  rl.close();
});