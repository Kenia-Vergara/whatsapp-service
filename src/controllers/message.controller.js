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

export function forceExpireQr(req, res) {
  try {
    const result = whatsappService.forceExpireQr('admin_request');
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}