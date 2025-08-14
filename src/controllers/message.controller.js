import whatsappService from '../services/whatsapp.service.js';
import { getTemplate } from '../templates.js';

export async function sendMessage(req, res) {
  try {
    const { phone, templateOption, psicologo, fecha, hora } = req.body;
    const result = await whatsappService.sendMessage({ phone, templateOption, psicologo, fecha, hora });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export function getStatus(req, res) {
  const qrStatus = whatsappService.getQrStatus();
  res.json({
    success: true,
    connected: whatsappService.isConnected(),
    qrStatus,
    timestamp: new Date().toISOString()
  });
}

// Nueva función para iniciar la conexión a WhatsApp
export async function startConnection(req, res) {
  try {
    const result = await whatsappService.startConnection();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error al iniciar conexión:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al iniciar conexión',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

export function getQrCode(req, res) {
  const qrData = whatsappService.getQrCode();

  if (!qrData) {
    const status = whatsappService.getQrStatus();

    if (status.status === 'connected') {
      return res.status(404).json({
        success: false,
        message: 'Ya está conectado, no se necesita QR',
        status: 'connected'
      });
    } else if (status.status === 'expired') {
      return res.status(410).json({
        success: false,
        message: 'El QR ha expirado, se generará uno nuevo automáticamente',
        status: 'expired'
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'QR no disponible aún, intente más tarde',
        status: 'waiting'
      });
    }
  }

  res.json({
    success: true,
    ...qrData,
    message: `QR válido por ${qrData.timeRemaining} segundos más`
  });
}

// Nueva función para solicitar un nuevo QR
export async function requestNewQr(req, res) {
  try {
    const userId = req.user.userId;
    const result = await whatsappService.requestNewQr(userId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        estimatedWaitTime: result.estimatedWaitTime,
        timestamp: new Date().toISOString()
      });
    } else {
      // Determinar el código de estado apropiado
      let statusCode = 400;

      switch (result.reason) {
        case 'QR_ACTIVE':
          statusCode = 409; // Conflict
          break;
        case 'RATE_LIMIT_EXCEEDED':
          statusCode = 429; // Too Many Requests
          break;
        case 'TOO_FREQUENT':
          statusCode = 429; // Too Many Requests
          break;
        case 'ALREADY_CONNECTED':
          statusCode = 409; // Conflict
          break;
        case 'CONNECTION_ERROR':
          statusCode = 503; // Service Unavailable
          break;
        default:
          statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        reason: result.reason,
        message: result.message,
        ...(result.timeRemaining && { timeRemaining: result.timeRemaining }),
        ...(result.timeToWait && { timeToWait: result.timeToWait }),
        ...(result.timeUntilReset && { timeUntilReset: result.timeUntilReset }),
        ...(result.error && { error: result.error }),
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error al solicitar nuevo QR:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
}

// Nueva función para obtener estadísticas de QR del usuario
export function getQrStats(req, res) {
  try {
    const userId = req.user.userId;
    const stats = whatsappService.getQrStats(userId);

    res.json({
      success: true,
      userId,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de QR:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
}

export function forceExpireQr(req, res) {
  try {
    const userId = req.user.userId;
    const result = whatsappService.forceExpireQr('admin_request', userId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}