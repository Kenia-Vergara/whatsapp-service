import { Router } from 'express';
import {
  sendMessage,
  getStatus,
  requestNewQr,
  forceExpireQr
} from '../controllers/message.controller.js';
import { validateSendMessage } from '../validators/message.validator.js';
import { authenticateJWT, authorizeRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/send-message', authenticateJWT, authorizeRole('admin'), validateSendMessage, sendMessage);
router.get('/status', authenticateJWT, getStatus);
router.post('/qr-request', authenticateJWT, authorizeRole('admin'), requestNewQr);
router.post('/qr-expire', authenticateJWT, authorizeRole('admin'), forceExpireQr);


export default router;