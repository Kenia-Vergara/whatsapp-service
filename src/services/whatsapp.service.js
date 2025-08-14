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

// Función para limpiar el socket de manera segura
function clearSocket(reason = 'unknown') {
  if (sock) {
    try {
      // Solo hacer logout si el WebSocket está en estado válido
      if (sock.ws && sock.ws.readyState === 1) { // WebSocket.OPEN
        sock.logout();
      }
    } catch (error) {
      console.log(`⚠️  Error al hacer logout del socket: ${error.message}`);
    } finally {
      sock = null;
      connected = false;
      console.log(`🗑️  Socket limpiado - Razón: ${reason}`);
    }
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
  // Verificar si ya hay una conexión activa
  if (sock && connected) {
    console.log('✅ WhatsApp ya está conectado');
    return { success: true, message: 'WhatsApp ya está conectado' };
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 30000, // 30 segundos de timeout
      defaultQueryTimeoutMs: 10000 // 10 segundos para queries
    });

    // Agregar manejo de errores del WebSocket
    sock.ev.on('error', (error) => {
      console.error('❌ Error en la conexión de WhatsApp:', error);
      clearSocket('websocket_error');
      clearQrCode('websocket_error');
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
          generatedBy: 'api_request', // Indica que fue generado por solicitud de API
          requestId: Date.now()
        };

        console.log(`🔄 Nuevo QR generado por solicitud de API - Expira en: ${expiryTime.toLocaleTimeString()}`);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log('🔄 Conexión cerrada, limpiando estado...');
          // No reconectar automáticamente, solo limpiar el estado
          clearSocket('connection_closed');
          clearQrCode('connection_closed');
        } else {
          console.log('❌ Usuario cerró sesión de WhatsApp');
          clearSocket('user_logout');
          clearQrCode('user_logout');
        }
      } else if (connection === 'open') {
        connected = true;
        console.log('✅ WhatsApp conectado exitosamente - QR expirado por seguridad');
        clearQrCode('successful_login');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Agregar timeout para evitar conexiones colgadas
    setTimeout(() => {
      if (sock && !connected && !qrCodeData) {
        console.log('⏰ Timeout de conexión, limpiando socket...');
        clearSocket('connection_timeout');
        clearQrCode('connection_timeout');
      }
    }, 60000); // 1 minuto

    return { success: true, message: 'Iniciando conexión a WhatsApp' };
  } catch (error) {
    console.error('Error al conectar con WhatsApp:', error);
    return { success: false, message: 'Error al conectar con WhatsApp', error: error.message };
  }
}

// NO se ejecuta automáticamente al importar el módulo
// connectToWhatsApp();

export default {
  isConnected: () => connected,

  // Nueva función para iniciar la conexión a WhatsApp
  startConnection: async () => {
    return await connectToWhatsApp();
  },

  // Función mejorada para solicitar un nuevo QR
  requestNewQr: async (userId) => {
    const validation = canGenerateNewQr(userId);

    if (!validation.allowed) {
      return {
        success: false,
        ...validation
      };
    }

    // Si no hay conexión activa, iniciar la conexión primero
    if (!sock || !connected) {
      console.log(`🔄 Iniciando conexión a WhatsApp para usuario: ${userId}`);
      const connectionResult = await connectToWhatsApp();
      
      if (!connectionResult.success) {
        return {
          success: false,
          reason: 'CONNECTION_ERROR',
          message: 'Error al iniciar conexión con WhatsApp',
          error: connectionResult.error
        };
      }
    }

    // Si no hay QR activo y hay un socket, intentar generar uno nuevo
    if (sock && !connected) {
      try {
        // Verificar que el socket esté en un estado válido antes de hacer logout
        if (sock.ws && sock.ws.readyState === 1) { // WebSocket.OPEN
          console.log(`🔄 Forzando nueva generación de QR para usuario: ${userId}`);
          sock.logout();
        } else {
          // Si el WebSocket no está listo, crear una nueva conexión
          console.log(`🔄 WebSocket no está listo, creando nueva conexión para usuario: ${userId}`);
          clearSocket('websocket_not_ready');
          await connectToWhatsApp();
        }

        // Registrar la solicitud
        recordQrGeneration(userId);

        return {
          success: true,
          message: 'Solicitud de nuevo QR procesada. Se generará automáticamente.',
          estimatedWaitTime: '5-10 segundos'
        };
      } catch (error) {
        console.error('Error al forzar nueva generación de QR:', error);
        
        // Si hay error, limpiar el socket y crear uno nuevo
        try {
          clearSocket('generation_error');
          await connectToWhatsApp();
        } catch (reconnectError) {
          console.error('Error al reconectar:', reconnectError);
        }

        return {
          success: false,
          reason: 'GENERATION_ERROR',
          message: 'Error al generar nuevo QR. Se intentará reconectar automáticamente.',
          error: error.message
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