import whatsappService from "../services/whatsapp.service.js";

const fs = require('fs');
const path = require('path');

export async function sendMessage(req, res) {
  try {
    const { phone, templateOption, psicologo, fecha, hora } = req.body;

    // Validaciones adicionales
    if (!phone || !templateOption || !psicologo || !fecha || !hora) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos requeridos",
        required: ["phone", "templateOption", "psicologo", "fecha", "hora"],
      });
    }

    const result = await whatsappService.sendMessage({
      phone,
      templateOption,
      psicologo,
      fecha,
      hora,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error en sendMessage:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function getStatus(req, res) {
  try {
    res.json({
      success: true,
      connected: whatsappService.isConnected(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en getStatus:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo estado",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function getQrStatus(req, res) {
  try {
    const qrStatus = whatsappService.getQRStatus();
    res.json({
      success: true,
      ...qrStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en getStatus:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo estado",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export async function startConnection(req, res) {
  try {
    console.log(
      `🔌 Usuario ${req.user.username} solicitando inicio de conexión`,
    );

    const result = await whatsappService.startConnection();

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        alreadyConnected: result.alreadyConnected || false,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        success: false,
        message: result.message,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error al iniciar conexión:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al iniciar conexión",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function getQrCode(req, res) {
  try {
    const qrData = whatsappService.getQrCode();

    if (qrData) {
      return res.json({
        success: true,
        ...qrData,
        message: `QR válido por ${qrData.timeRemaining} segundos más`,
      });
    }

    return res.status(404).json({
      success: false,
      message:
        "No hay QR disponible. Solicita uno nuevo con POST /api/qr-request",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en getQrCode:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo QR",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export async function requestNewQr(req, res) {
  try {
    const userId = req.user.userId;
    console.log(`📱 Usuario ${userId} solicitando nuevo QR`);

    const result = await whatsappService.requestQR(userId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        estimatedWaitTime: result.estimatedWaitTime,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Mapear códigos de estado apropiados
      const statusCodeMap = {
        QR_ACTIVE: 409, // Conflict
        RATE_LIMIT_EXCEEDED: 429, // Too Many Requests
        TOO_FREQUENT: 429, // Too Many Requests
        ALREADY_CONNECTED: 409, // Conflict
        CONNECTION_ERROR: 503, // Service Unavailable
        QR_REQUEST_ERROR: 500, // Internal Server Error
      };

      const statusCode = statusCodeMap[result.reason] || 400;

      res.status(statusCode).json({
        success: false,
        reason: result.reason,
        message: result.message,
        ...(result.timeRemaining && { timeRemaining: result.timeRemaining }),
        ...(result.timeToWait && { timeToWait: result.timeToWait }),
        ...(result.timeUntilReset && { timeUntilReset: result.timeUntilReset }),
        ...(result.error && { error: result.error }),
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error al solicitar nuevo QR:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function getQrStats(req, res) {
  try {
    const userId = req.user.userId;
    const stats = whatsappService.getQrStats(userId);

    res.json({
      success: true,
      userId,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al obtener estadísticas de QR:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function forceExpireQr(req, res) {
  try {
    const userId = req.user.username;
    console.log(`🗑️ Usuario ${userId} forzando expiración de QR`);

    const result = whatsappService.expireQR("admin_request", userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error al forzar expiración de QR:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

// Función adicional para obtener información detallada del estado de conexión
export function getConnectionInfo(req, res) {
  try {
    const status = whatsappService.getQrStatus();
    const isConnected = whatsappService.isConnected();

    res.json({
      success: true,
      connectionDetails: {
        isConnected,
        status: status.status,
        message: status.message,
        connectionState: status.connectionState,
        qrAvailable: !!whatsappService.getQrCode(),
        qrTimeRemaining: status.timeRemaining || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error obteniendo información de conexión:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo información de conexión",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

// Función para reiniciar completamente la conexión (solo admin)
export async function restartConnection(req, res) {
  try {
    const userId = req.user.username;
    console.log(
      `🔄 Usuario ${userId} solicitando reinicio completo de conexión`,
    );

    // Limpiar conexión actual
    await whatsappService.cleanup();

    // Esperar un poco antes de reiniciar
    setTimeout(async () => {
      try {
        const result = await whatsappService.startConnection();
        console.log(`✅ Conexión reiniciada por ${userId}: ${result.message}`);
      } catch (error) {
        console.error(`❌ Error reiniciando conexión para ${userId}:`, error);
      }
    }, 2000);

    res.json({
      success: true,
      message: "Reinicio de conexión iniciado",
      note: "La conexión se está reiniciando en segundo plano",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al reiniciar conexión:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}


export function resetAuth(req, res) {
  // logica para eliminar la carpeta auth_info alojada en la raiz a nivel de src y node_modules
  const rutaCarpeta = path.resolve(__dirname, 'auth_info');
  fs.rm(rutaCarpeta, { recursive: true, force: true }, (err) => {
    if (err) {
      console.error(`Error eliminando la carpeta ${rutaCarpeta}:`, err);
    } else {
      console.log(`Carpeta ${rutaCarpeta} eliminada correctamente.`);
    }
  });
}