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
  try {
    const qrData = whatsappService.getQrCode();
    
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: 'No hay QR activo en este momento',
        suggestion: 'Usa el endpoint /qr-request para generar un nuevo QR',
        timestamp: new Date().toISOString(),
        hasActiveQR: false,
        isConnected: whatsappService.getQRStatus().isConnected
      });
    }

    // Determinar el estado del tiempo
    let timeStatus = 'normal';
    let urgencyMessage = '';
    
    if (qrData.timeRemaining <= 10) {
      timeStatus = 'critical';
      urgencyMessage = '¡URGENTE! El QR expira en menos de 10 segundos';
    } else if (qrData.timeRemaining <= 30) {
      timeStatus = 'warning';
      urgencyMessage = 'El QR expira pronto, considera renovarlo';
    } else if (qrData.timeRemaining <= 45) {
      timeStatus = 'notice';
      urgencyMessage = 'El QR tiene poco tiempo restante';
    }

    return res.json({
      success: true,
      hasActiveQR: true,
      message: `QR activo con ${qrData.timeRemaining} segundos restantes`,
      qrInfo: {
        image: qrData.image,
        expiresAt: qrData.expiresAt,
      },
    });
    
  } catch (error) {
    logger.error('Error getting QR code', { 
      userId: req.user?.userId, 
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Error al obtener el código QR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Nueva función para solicitar un nuevo QR
export async function requestNewQr(req, res) {
  try {
    const result = await whatsappService.requestQR(req.user.userId);
    logger.info('QR generated successfully', { userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Codigo qr creado',
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

// Nueva función para obtener el estado detallado del QR
export function getQrStatus(req, res) {
  try {
    const status = whatsappService.getQRStatus();
    const { hasActiveQR, qrData, isConnected } = status;
    
    if (!hasActiveQR) {
      return res.json({
        success: true,
        hasActiveQR: false,
        isConnected,
        message: 'No hay QR activo en este momento',
        suggestion: 'Usa el endpoint /qr-request para generar un nuevo QR',
        timestamp: new Date().toISOString()
      });
    }

    // Calcular tiempo restante
    const now = Date.now();
    const timeRemaining = Math.floor((qrData.expiresAt - now) / 1000);
    
    // Determinar el estado del tiempo
    let timeStatus = 'normal';
    let urgencyMessage = '';
    
    if (timeRemaining <= 10) {
      timeStatus = 'critical';
      urgencyMessage = '¡URGENTE! El QR expira en menos de 10 segundos';
    } else if (timeRemaining <= 30) {
      timeStatus = 'warning';
      urgencyMessage = 'El QR expira pronto, considera renovarlo';
    } else if (timeRemaining <= 45) {
      timeStatus = 'notice';
      urgencyMessage = 'El QR tiene poco tiempo restante';
    }

    // Calcular porcentaje de vida restante
    const totalLifetime = 60; // 60 segundos
    const percentageRemaining = Math.round((timeRemaining / totalLifetime) * 100);

    // Información adicional útil
    const response = {
      success: true,
      hasActiveQR: true,
      isConnected,
      qrInfo: {
        timeRemaining,
        timeRemainingFormatted: `${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60).toString().padStart(2, '0')}`,
        percentageRemaining,
        timeStatus,
        urgencyMessage,
        expiresAt: qrData.expiresAt,
        createdAt: qrData.createdAt,
        age: Math.floor((now - new Date(qrData.createdAt).getTime()) / 1000)
      },
      actions: {
        canRenew: timeRemaining <= 45,
        shouldRenew: timeRemaining <= 30,
        mustRenew: timeRemaining <= 10
      },
      timestamp: new Date().toISOString()
    };

    // Agregar mensaje de estado
    if (timeRemaining <= 0) {
      response.message = 'El QR ha expirado';
      response.hasActiveQR = false;
    } else {
      response.message = `QR activo con ${timeRemaining} segundos restantes`;
    }

    res.json(response);
    
  } catch (error) {
    logger.error('Error getting QR status', { 
      userId: req.user?.userId, 
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Error al obtener el estado del QR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}