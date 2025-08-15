import whatsappService from '../services/whatsapp.service.js';
import logger from '../utils/logger.js';

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
  const status = whatsappService.getQRStatus();
  const {hasActiveQR, isConnected} = status;
  res.json({
    success: true,
    hasActiveQR,
    isConnected
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
  if (qrData) {
    return res.json({
      success: true,
      ...qrData,
      message: `QR válido por ${qrData.timeRemaining} segundos más`
    });
  }

  return res.status(404).json({
    success: false,
    message: 'No hay QR disponible.',
  });
}

// Nueva función para solicitar un nuevo QR
export async function requestNewQr(req, res) {
  try {
    const result = await whatsappService.requestQR(req.user.userId);
    logger.info('QR generated successfully', { userId: req.user.userId });
    
    res.json({
      success: true,
      qr: result.qr,
      expiresAt: Math.floor((result.expiresAt - Date.now()) / 1000),
    });
  } catch (error) {
    logger.error('Failed to generate QR', { 
      userId: req.user.userId, 
      error: error.message 
    });

    const statusCode = error.code === 'QR_ACTIVE' ? 409 : 
                      error.code === 'RATE_LIMITED' ? 429 : 500;
    
    res.status(statusCode).json({
      success: false,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      ...(error.expiresAt && { expiresAt: error.expiresAt }),
      ...(error.resetTime && { resetTime: error.resetTime })
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

export async function forceExpireQr(req, res) {
  try {
    const expired = await whatsappService.expireQR();
    res.json({ 
      success: true,
      expired: expired
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}