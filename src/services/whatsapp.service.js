import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { getTemplate } from '../templates.js';

let sock;
let connected = false;
let qrCodeData = null;

// Configuración mejorada del QR
const QR_CONFIG = {
  EXPIRY_TIME: 1 * 60 * 1000, // 1 minuto
  MIN_INTERVAL_BETWEEN_QR: 30 * 1000, // 30 segundos mínimo entre QR
  MAX_QR_PER_HOUR: 10, // Máximo 10 QR por hora por usuario
  MAX_ACTIVE_QR: 1 // Solo 1 QR activo a la vez
};

// Historial de QR generados para auditoría y rate limiting
const qrHistory = new Map(); // userId -> Array de timestamps
const activeQrRequests = new Set(); // IDs de solicitudes activas

// Función para limpiar el QR y marcar como expirado
function clearQrCode(reason = 'unknown') {
  if (qrCodeData) {
    console.log(`🗑️  QR expirado/limpiado - Razón: ${reason}`);
    qrCodeData = null;
  }
}

// Función para validar si se puede generar un nuevo QR
function canGenerateNewQr(userId) {
  const now = Date.now();

  // Si ya hay un QR activo, no permitir generar otro
  if (qrCodeData && !isQrExpired()) {
    return {
      allowed: false,
      reason: 'QR_ACTIVE',
      message: 'Ya existe un código QR activo. Espere a que expire o se use.',
      timeRemaining: getQrTimeRemaining()
    };
  }

  // Verificar rate limiting por usuario
  if (!qrHistory.has(userId)) {
    qrHistory.set(userId, []);
  }

  const userQrHistory = qrHistory.get(userId);
  const oneHourAgo = now - (60 * 60 * 1000);

  // Limpiar historial antiguo (más de 1 hora)
  const recentQrRequests = userQrHistory.filter(timestamp => timestamp > oneHourAgo);
  qrHistory.set(userId, recentQrRequests);

  // Verificar límite por hora
  if (recentQrRequests.length >= QR_CONFIG.MAX_QR_PER_HOUR) {
    const oldestRequest = Math.min(...recentQrRequests);
    const timeUntilReset = oldestRequest + (60 * 60 * 1000) - now;

    return {
      allowed: false,
      reason: 'RATE_LIMIT_EXCEEDED',
      message: `Límite de QR excedido. Puede solicitar otro en ${Math.ceil(timeUntilReset / 1000)} segundos.`,
      timeUntilReset: Math.ceil(timeUntilReset / 1000)
    };
  }

  // Verificar intervalo mínimo entre QR
  if (recentQrRequests.length > 0) {
    const lastQrTime = Math.max(...recentQrRequests);
    const timeSinceLastQr = now - lastQrTime;

    if (timeSinceLastQr < QR_CONFIG.MIN_INTERVAL_BETWEEN_QR) {
      const timeToWait = QR_CONFIG.MIN_INTERVAL_BETWEEN_QR - timeSinceLastQr;

      return {
        allowed: false,
        reason: 'TOO_FREQUENT',
        message: `Espere ${Math.ceil(timeToWait / 1000)} segundos antes de solicitar otro QR.`,
        timeToWait: Math.ceil(timeToWait / 1000)
      };
    }
  }

  return { allowed: true };
}

// Función para verificar si el QR ha expirado
function isQrExpired() {
  if (!qrCodeData) return true;

  const now = new Date();
  const expiryTime = new Date(qrCodeData.expiresAt);
  return now > expiryTime;
}

// Función para obtener tiempo restante del QR
function getQrTimeRemaining() {
  if (!qrCodeData) return 0;

  const now = new Date();
  const expiryTime = new Date(qrCodeData.expiresAt);
  const timeRemaining = expiryTime - now;

  return Math.max(0, Math.ceil(timeRemaining / 1000));
}

// Función para registrar la generación de un QR
function recordQrGeneration(userId) {
  if (!qrHistory.has(userId)) {
    qrHistory.set(userId, []);
  }

  const userQrHistory = qrHistory.get(userId);
  userQrHistory.push(Date.now());

  // Mantener solo los últimos 20 registros para optimizar memoria
  if (userQrHistory.length > 20) {
    userQrHistory.splice(0, userQrHistory.length - 20);
  }

  console.log(`📊 QR generado para usuario: ${userId} - Total en la última hora: ${userQrHistory.length}`);
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
      const expiryTime = new Date(Date.now() + QR_CONFIG.EXPIRY_TIME);

      qrCodeData = {
        qrCode: qrCodeBase64,
        expiresAt: expiryTime.toISOString(),
        expiresIn: QR_CONFIG.EXPIRY_TIME,
        createdAt: new Date().toISOString(),
        generatedBy: 'system', // Indica que fue generado automáticamente
        requestId: null
      };

      console.log(`🔄 Nuevo QR generado automáticamente - Expira en: ${expiryTime.toLocaleTimeString()}`);
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
      clearQrCode('successful_login');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

export default {
  isConnected: () => connected,

  // Función mejorada para solicitar un nuevo QR
  requestNewQr: (userId) => {
    const validation = canGenerateNewQr(userId);

    if (!validation.allowed) {
      return {
        success: false,
        ...validation
      };
    }

    // Si no hay QR activo, forzar la desconexión para generar uno nuevo
    if (sock && !connected) {
      try {
        sock.logout();
        console.log(`🔄 Forzando nueva generación de QR para usuario: ${userId}`);

        // Registrar la solicitud
        recordQrGeneration(userId);

        return {
          success: true,
          message: 'Solicitud de nuevo QR procesada. Se generará automáticamente.',
          estimatedWaitTime: '5-10 segundos'
        };
      } catch (error) {
        console.error('Error al forzar nueva generación de QR:', error);
        return {
          success: false,
          reason: 'GENERATION_ERROR',
          message: 'Error al generar nuevo QR. Intente más tarde.'
        };
      }
    }

    return {
      success: false,
      reason: 'ALREADY_CONNECTED',
      message: 'WhatsApp ya está conectado. No se necesita nuevo QR.'
    };
  },

  getQrCode: () => {
    if (!qrCodeData) return null;

    // Verificar si el QR ha expirado
    if (isQrExpired()) {
      clearQrCode('time_expired');
      return null;
    }

    const timeRemaining = getQrTimeRemaining();

    return {
      ...qrCodeData,
      timeRemaining,
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

    if (isQrExpired()) {
      return {
        status: 'expired',
        message: 'El QR ha expirado, se generará uno nuevo automáticamente'
      };
    }

    const timeRemaining = getQrTimeRemaining();

    return {
      status: 'active',
      message: `QR activo - Expira en ${timeRemaining} segundos`,
      timeRemaining
    };
  },

  // Función para obtener estadísticas de uso de QR
  getQrStats: (userId) => {
    if (!qrHistory.has(userId)) {
      return {
        totalQrGenerated: 0,
        qrInLastHour: 0,
        canGenerateNow: true
      };
    }

    const userQrHistory = qrHistory.get(userId);
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const qrInLastHour = userQrHistory.filter(timestamp => timestamp > oneHourAgo).length;
    const validation = canGenerateNewQr(userId);

    return {
      totalQrGenerated: userQrHistory.length,
      qrInLastHour,
      canGenerateNow: validation.allowed,
      timeUntilNextQr: validation.allowed ? 0 : validation.timeToWait || validation.timeUntilReset || 0
    };
  },

  // Función para forzar la expiración del QR (útil para testing)
  forceExpireQr: (reason = 'manual', userId = 'admin') => {
    clearQrCode(reason);

    // Registrar la acción
    if (userId !== 'admin') {
      recordQrGeneration(userId);
    }

    return {
      success: true,
      message: 'QR expirado manualmente',
      reason,
      userId
    };
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