import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { getTemplate } from '../templates.js';

let sock;
let connected = false;
let qrCodeData = null;

// Tiempo de vida del QR en milisegundos (por defecto 1 minuto)
const QR_EXPIRY_TIME = 1 * 60 * 1000; // 1 minuto

// Función para limpiar el QR y marcar como expirado
function clearQrCode(reason = 'unknown') {
  if (qrCodeData) {
    console.log(`🗑️  QR expirado/limpiado - Razón: ${reason}`);
    qrCodeData = null;
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Generamos el QR con tiempo de expiración
      const qrCodeBase64 = await QRCode.toDataURL(qr);
      const expiryTime = new Date(Date.now() + QR_EXPIRY_TIME);

      qrCodeData = {
        qrCode: qrCodeBase64,
        expiresAt: expiryTime.toISOString(),
        expiresIn: QR_EXPIRY_TIME,
        createdAt: new Date().toISOString()
      };

      console.log(`🔄 Nuevo QR generado - Expira en: ${expiryTime.toLocaleTimeString()}`);
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('🔄 Reconectando WhatsApp...');
        connectToWhatsApp();
      } else {
        console.log('❌ Usuario cerró sesión de WhatsApp');
      }
      connected = false;
      clearQrCode('connection_closed');
    } else if (connection === 'open') {
      connected = true;
      console.log('✅ WhatsApp conectado exitosamente - QR expirado por seguridad');
      clearQrCode('successful_login'); // Expirar QR inmediatamente al conectar
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

export default {
  isConnected: () => connected,
  getQrCode: () => {
    if (!qrCodeData) return null;

    // Verificar si el QR ha expirado
    const now = new Date();
    const expiryTime = new Date(qrCodeData.expiresAt);

    if (now > expiryTime) {
      clearQrCode('time_expired');
      return null;
    }

    // Calcular tiempo restante
    const timeRemaining = expiryTime - now;
    const timeRemainingSeconds = Math.ceil(timeRemaining / 1000);

    return {
      ...qrCodeData,
      timeRemaining: timeRemainingSeconds,
      isExpired: false
    };
  },
  getQrStatus: () => {
    if (connected) {
      return {
        status: 'connected',
        message: 'WhatsApp está conectado - QR expirado por seguridad',
        connectedAt: new Date().toISOString()
      };
    }

    if (!qrCodeData) {
      return {
        status: 'waiting',
        message: 'Esperando generación del QR'
      };
    }

    // Verificar si el QR ha expirado
    const now = new Date();
    const expiryTime = new Date(qrCodeData.expiresAt);

    if (now > expiryTime) {
      return {
        status: 'expired',
        message: 'El QR ha expirado, se generará uno nuevo automáticamente'
      };
    }

    const timeRemaining = expiryTime - now;
    const timeRemainingSeconds = Math.ceil(timeRemaining / 1000);

    return {
      status: 'active',
      message: `QR activo - Expira en ${timeRemainingSeconds} segundos`,
      timeRemaining: timeRemainingSeconds
    };
  },
  // Función para forzar la expiración del QR (útil para testing)
  forceExpireQr: (reason = 'manual') => {
    clearQrCode(reason);
    return { success: true, message: 'QR expirado manualmente' };
  },
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