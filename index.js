const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode-terminal");

async function conectar() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      console.log("\nEscanea este QR:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("\n✅ WhatsApp conectado");
    }

    if (connection === "close") {
      console.log("\n❌ Conexion cerrada");
    }
  });
}

conectar().catch(console.error);