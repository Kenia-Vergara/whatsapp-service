import { Router } from 'express';
import { sendMessage, getStatus, getQrCode } from '../controllers/message.controller.js';
import { validateSendMessage } from '../validators/message.validator.js';
import { authenticateJWT, authorizeRole } from '../middlewares/auth.middleware.js';

const router = Router();

// Solo administradores pueden enviar mensajes y ver el QR
router.post('/send-message', authenticateJWT, authorizeRole('admin'), validateSendMessage, sendMessage);
router.get('/qr-code', authenticateJWT, authorizeRole('admin'), getQrCode);

// Cualquier usuario autenticado puede ver el estado
router.get('/status', authenticateJWT, getStatus);

export default router;