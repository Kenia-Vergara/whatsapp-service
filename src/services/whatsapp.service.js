import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { getTemplate } from '../templates.js';

let sock;
let connected = false;
let qrCodeData = null;
let connectionRetries = 0;
let connectionState = 'disconnected';
let isConnecting = false;


// Configuración mejorada del QR
const QR_CONFIG = {
  EXPIRY_TIME: 1 * 60 * 1000, // 1 minuto
  MIN_INTERVAL_BETWEEN_QR: 30 * 1000, // 30 segundos mínimo entre QR
  MAX_QR_PER_HOUR: 10, // Máximo 10 QR por hora por usuario
  MAX_ACTIVE_QR: 1 // Solo 1 QR activo a la vez
};

// Configuración mejorada
const CONNECTION_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 3000, // 3 segundos entre reintentos
  QR_TIMEOUT: 30000, // 30 segundos para QR
  CONNECTION_TIMEOUT: 20000 // 20 segundos timeout de conexión
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
  if (!qrHistory.has(userId)) {
    qrHistory.set(userId, []);
  }

  const now = Date.now();
  const userHistory = qrHistory.get(userId);

  // Limpiar registros antiguos (> 1 hora)
  const cleanedHistory = userHistory.filter(t => (now - t) < (60 * 60 * 1000));
  qrHistory.set(userId, cleanedHistory);

  // Verificar límites
  if (cleanedHistory.length >= QR_CONFIG.MAX_QR_PER_HOUR) {
    const oldest = Math.min(...cleanedHistory);
    const resetTime = oldest + (60 * 60 * 1000);
    throw new Error(`Límite de QR excedido. Intenta nuevamente en ${Math.ceil((resetTime - now) / 1000)} segundos`);
  }

  if (cleanedHistory.length > 0) {
    const lastRequest = Math.max(...cleanedHistory);
    const timeSinceLast = now - lastRequest;

    if (timeSinceLast < QR_CONFIG.MIN_INTERVAL_BETWEEN_QR) {
      throw new Error(`Espera ${Math.ceil((QR_CONFIG.MIN_INTERVAL_BETWEEN_QR - timeSinceLast) / 1000)} segundos antes de solicitar otro QR`);
    }
  }

  if (qrCodeData && !isQrExpired()) {
    throw new Error('Ya hay un QR activo. Espera a que expire o escanéalo');
  }

  return true;
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
  try {
    if (!qrHistory.has(userId)) {
      qrHistory.set(userId, []);
    }

    const now = Date.now();
    const userHistory = qrHistory.get(userId);

    // Limpieza previa
    const cleaned = userHistory.filter(t => (now - t) < (24 * 60 * 60 * 1000)); // Mantener máximo 1 día

    // Registrar nuevo QR
    cleaned.push(now);
    qrHistory.set(userId, cleaned);

    console.log(`📊 QR registrado para ${userId} - Última hora: ${cleaned.filter(t => (now - t) < (60 * 60 * 1000)).length}/${QR_CONFIG.MAX_QR_PER_HOUR}`);
  } catch (error) {
    console.error('Error registrando QR:', error);
  }
}

async function connectToWhatsApp() {
  if (isConnecting) {
    console.log('⚠️ Conexión ya en progreso, ignorando solicitud duplicada');
    return { success: false, message: 'Conexión ya en progreso' };
  }

  isConnecting = true;
  console.log('🔃 Iniciando nueva conexión WhatsApp...');

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    // Limpiar conexión anterior si existe
    if (sock) {
      clearConnection('new_connection_attempt');
    }

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: CONNECTION_CONFIG.CONNECTION_TIMEOUT,
      defaultQueryTimeoutMs: 10000,
      keepAliveIntervalMs: 20000,
      browser: ['Ubuntu', 'Chrome', '20.0.0']
    });

    sock.ev.on('connection.update', handleConnectionUpdate);
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('error', handleConnectionError);

    return { success: true, message: 'Conexión iniciada correctamente' };
  } catch (error) {
    isConnecting = false;
    console.error('❌ Error crítico en conexión:', error);
    return {
      success: false,
      message: 'Error al establecer conexión',
      error: error.message
    };
  }
}

function handleConnectionUpdate(update) {
  const { connection, qr } = update;

  // Manejar QR
  if (qr && activeQrRequests.size > 0) {
    generateNewQR(qr).finally(() => {
      activeQrRequests.clear();
    });
  }

  // Manejar estados de conexión
  if (connection === 'open') {
    connectionState = 'connected';
    clearQrCode('connected');
  }
  else if (connection === 'close') {
    connectionState = 'disconnected';
  }
}

function handleConnectionError(error) {
  if (error.message.includes("QR refs attempts ended")) {
    console.log("🔄 QR no escaneado: El qr expiro por su tiempo limite"); // Mensaje más amigable
    clearQrCode('qr_attempts_ended');
    setTimeout(() => connectToWhatsApp(), CONNECTION_CONFIG.RETRY_DELAY);
  } else {
    console.error('❌ Error de conexión:', error);
    // Resto de tu lógica para otros errores...
  }
}

async function reconnectToWhatsApp() {
  if (connectionRetries >= CONNECTION_CONFIG.MAX_RETRIES) {
    console.log('❌ Máximo de reintentos alcanzado');
    clearConnection('max_retries');
    return;
  }

  connectionRetries++;
  console.log(`🔄 Intento de reconexión #${connectionRetries}`);

  try {
    clearConnection('reconnecting');
    await connectToWhatsApp();
  } catch (error) {
    console.error('Error en reconexión:', error);
  }
}

function clearConnection(reason = 'unknown') {
  console.log(`🗑️  Limpiando conexión - Razón: ${reason}`);

  try {
    if (sock) {
      sock.ev.off('connection.update', handleConnectionUpdate);
      sock.ev.off('creds.update', saveCreds);
      sock.ev.off('error', handleConnectionError);

      if (sock.ws?.readyState === 1) { // WebSocket.OPEN
        sock.end();
      }
    }
  } catch (error) {
    console.error('Error al limpiar conexión:', error);
  } finally {
    sock = null;
    connected = false;
    isConnecting = false;
    clearQrCode(reason);
  }
}

async function generateNewQR(qr) {
  try {
    const qrCodeBase64 = await QRCode.toDataURL(qr);
    const expiryTime = new Date(Date.now() + QR_CONFIG.EXPIRY_TIME);

    qrCodeData = {
      qrCode: qrCodeBase64,
      expiresAt: expiryTime.toISOString(),
      createdAt: new Date().toISOString()
    };

    console.log(`🔄 QR generado - Expira en: ${expiryTime.toLocaleTimeString()}`);
  } catch (error) {
    console.error('Error generando QR:', error);
    throw error;
  }
}

export default {
  isConnected: () => connected,

  // Nueva función para iniciar la conexión a WhatsApp
  startConnection: async () => {
    return await connectToWhatsApp();
  },

  // Función mejorada para solicitar un nuevo QR
  requestNewQr: async (userId) => {
    try {
      // Validación de rate limiting
      canGenerateNewQr(userId);

      // Si ya estamos conectados, no necesitamos QR
      if (connectionState === 'connected') {
        return {
          success: false,
          code: 'ALREADY_CONNECTED',
          message: 'Ya estás conectado a WhatsApp'
        };
      }

      // Si hay un QR activo y no ha expirado
      if (qrCodeData && !isQrExpired()) {
        return {
          success: true,
          code: 'QR_ACTIVE',
          message: 'Ya hay un QR activo',
          qrData: qrCodeData
        };
      }

      // Manejo de conexión
      if (connectionState === 'disconnected') {
        connectionState = 'connecting';
        await connectToWhatsApp();
      }

      // Forzar generación de nuevo QR si es necesario
      activeQrRequests.add(userId);
      if (sock?.ws?.readyState === 1) {
        await sock.logout();
      }

      recordQrGeneration(userId);

      return {
        success: true,
        message: 'Solicitud de QR procesada',
        status: connectionState
      };

    } catch (error) {
      activeQrRequests.delete(userId);
      connectionState = 'disconnected';
      console.error(`❌ Error en solicitud de QR [${error.code || 'UNKNOWN'}]:`, error.message);

      const response = {
        success: false,
        code: error.code || 'QR_GENERATION_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      };

      // Agregar metadatos adicionales según el tipo de error
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        response.timeUntilReset = error.timeUntilReset;
      } else if (error.code === 'QR_ACTIVE') {
        response.activeQrExpiresIn = error.expiresIn;
      } else if (error.error) {
        response.errorDetails = error.error;
      }

      return response;
    }
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
      return { status: 'connected', message: 'Ya estás conectado' };
    }

    if (qrCodeData) {
      return {
        status: isQrExpired() ? 'expired' : 'active',
        message: isQrExpired()
          ? 'QR expirado. Solicite uno nuevo.'
          : `QR activo`,
        expiresAt: getQrTimeRemaining(),
      };
    }

    return { status: 'waiting', message: 'No hay QR generado' };
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