import whatsappService from '../services/whatsapp.service.js';

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
  res.json({
    connected: whatsappService.isConnected(),
    timestamp: new Date().toISOString()
  });
}

export function getQrCode(req, res) {
  const qrCode = whatsappService.getQrCode();
  if (!qrCode) {
    return res.status(404).json({
      success: false,
      message: whatsappService.isConnected() ?
        'Ya está conectado, no se necesita QR' :
        'QR no disponible aún, intente más tarde'
    });
  }
  res.json({ success: true, qrCode });
}