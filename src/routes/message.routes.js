import { Router } from 'express';
import { sendMessage, getStatus } from '../controllers/message.controller.js';
import { validateSendMessage } from '../validators/message.validator.js';

const router = Router();

router.post('/send-message', validateSendMessage, sendMessage);
router.get('/status', getStatus);
router.get('/qr-code', getQrCode);

export default router;