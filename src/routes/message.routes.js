import { Router } from 'express';
import {
  sendMessage,
  getStatus,
  getQrCode,
  requestNewQr,
  getQrStats,
  forceExpireQr
} from '../controllers/message.controller.js';
import { validateSendMessage } from '../validators/message.validator.js';
import { authenticateJWT, authorizeRole } from '../middlewares/auth.middleware.js';

const router = Router();

// Solo administradores pueden enviar mensajes y ver el QR
router.post('/send-message', authenticateJWT, authorizeRole('admin'), validateSendMessage, sendMessage);
router.get('/qr-code', authenticateJWT, authorizeRole('admin'), getQrCode);

// Cualquier usuario autenticado puede ver el estado
router.get('/status', authenticateJWT, getStatus);

// Nueva ruta para solicitar un nuevo QR
router.post('/qr-request', authenticateJWT, authorizeRole('admin'), requestNewQr);

// Nueva ruta para ver estadísticas de QR del usuario
router.get('/qr-stats', authenticateJWT, getQrStats);

// Endpoint para forzar expiración del QR (solo admin)
router.post('/qr-expire', authenticateJWT, authorizeRole('admin'), forceExpireQr);

export default router;