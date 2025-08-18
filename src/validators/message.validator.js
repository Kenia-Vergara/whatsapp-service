import { body, validationResult } from 'express-validator';

export const validateSendMessage = [
  body('phone').isString().notEmpty().withMessage('Teléfono requerido'),
  body('templateOption').isString().notEmpty().withMessage('Plantilla requerida'),
  // Puedes agregar más validaciones según tus necesidades
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];