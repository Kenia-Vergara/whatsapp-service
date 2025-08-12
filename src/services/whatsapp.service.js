import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { getTemplate } from '../templates.js';

let sock;
let connected = false;
let qrCodeBase64 = null; // Almacenará el QR en base64

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false // Desactivamos la impresión en terminal
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Generamos el QR como base64
      qrCodeBase64 = await QRCode.toDataURL(qr);
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) connectToWhatsApp();
      connected = false;
      qrCodeBase64 = null;
    } else if (connection === 'open') {
      connected = true;
      qrCodeBase64 = null; // Limpiamos el QR cuando ya estamos conectados
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

export default {
  isConnected: () => connected,
  getQrCode: () => qrCodeBase64,
  sendMessage: async ({ phone, templateOption, psicologo, fecha, hora }) => {
    if (!connected) throw new Error('WhatsApp no está conectado');
    let formattedPhone = phone.replace(/[^\d]/g, '');
    if (formattedPhone.length < 8) throw new Error('El número de teléfono debe estar en formato internacional');
    formattedPhone += '@s.whatsapp.net';
    const plantilla = getTemplate(templateOption, { nombrePsicologo: psicologo, fecha, hora });
    const result = await sock.sendMessage(formattedPhone, { text: plantilla });
    return { message: 'Mensaje enviado correctamente', messageId: result.key.id };
  }
};