import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { getTemplate } from '../templates.js';
import logger from '../utils/logger.js';

// Estado centralizado
const connectionState = {
  socket: null,
  qrData: null,
  isConnecting: false,
  userConnections: new Map() // Para rate limiting por usuario
};

// --- Funciones Principales ---
async function createNewSession() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    connectTimeoutMs: 20000
  });

  sock.ev.on('creds.update', saveCreds);
  return sock;
}

async function generateNewQR(session) {
  return new Promise((resolve, reject) => {
    const qrTimeout = setTimeout(() => {
      session.ev.off('connection.update', qrHandler);
      reject(new Error('Timeout al generar QR'));
    }, 20000);

    const qrHandler = (update) => {
      if (update.qr) {
        clearTimeout(qrTimeout);
        session.ev.off('connection.update', qrHandler);
        QRCode.toDataURL(update.qr)
          .then(qrImage => resolve(qrImage))
          .catch(reject);
      }
    };

    session.ev.on('connection.update', qrHandler);
  });
}

async function cleanupConnection() {
  if (connectionState.socket) {
    try {
      await connectionState.socket.end();
    } catch (error) {
      logger.debug('Error closing connection', { error: error.message });
    }
  }
  connectionState.socket = null;
  connectionState.qrData = null;
  connectionState.isConnecting = false;
}

// --- API Pública ---
export default {
  async requestQR(userId) {
    try {
      logger.info('Requesting new QR code', { userId });

      if (connectionState.qrData && Date.now() < connectionState.qrData.expiresAt) {
        throw {
          code: 'QR_ACTIVE',
          message: 'Ya hay un QR activo',
          expiresAt: connectionState.qrData.expiresAt
        };
      }

      // Rate limiting
      const now = Date.now();
      const userHistory = connectionState.userConnections.get(userId) || [];
      const recentAttempts = userHistory.filter(t => now - t < 3600000).length;

      if (recentAttempts >= 10) {
        throw {
          code: 'RATE_LIMITED',
          message: 'Límite de solicitudes alcanzado',
          resetTime: userHistory[0] + 3600000
        };
      }

      connectionState.isConnecting = true;
      await cleanupConnection();

      connectionState.socket = await createNewSession();
      const qrImage = await generateNewQR(connectionState.socket);

      connectionState.qrData = {
        image: qrImage,
        expiresAt: Date.now() + 60000,
        createdAt: new Date().toISOString()
      };

      connectionState.userConnections.set(userId, [...userHistory, now].slice(-10));

      return {
        success: true,
        qr: qrImage,
        expiresAt: connectionState.qrData.expiresAt
      };
    } catch (error) {
      logger.error('Error generating QR', {
        userId,
        error: error.message,
        code: error.code
      });

      throw error;
    } finally {
      connectionState.isConnecting = false;
    }
  },

  async expireQR() {
    const hadActiveQR = !!connectionState.qrData;
    await cleanupConnection();
    return hadActiveQR;
  },

  getQRStatus() {
    return {
      hasActiveQR: !!connectionState.qrData && Date.now() < connectionState.qrData.expiresAt,
      qrData: connectionState.qrData,
      isConnected: connectionState.socket?.user ? true : false
    };
  },

  async sendMessage({ phone, templateOption, psicologo, fecha, hora }) {
    if (!connectionState.socket?.user) {
      throw new Error('No conectado a WhatsApp');
    }

    const formattedPhone = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    const message = getTemplate(templateOption, { nombrePsicologo: psicologo, fecha, hora });

    try {
      const result = await connectionState.socket.sendMessage(formattedPhone, { text: message });
      return { success: true, messageId: result.key.id };
    } catch (error) {
      if (error.message.includes('disconnected')) {
        await cleanupConnection();
      }
      throw error;
    }
  }
};