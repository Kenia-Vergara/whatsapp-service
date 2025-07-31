import { body, validationResult } from 'express-validator';

const validTemplates = [
  'cita_gratis',
  'cita_pagada',
  'recordatorio_cita',
  'confirmacion_asistencia'
];

export const validateSendMessage = [
  body('phone').isString().notEmpty().withMessage('Teléfono requerido'),
  body('templateOption')
    .isString()
    .notEmpty().withMessage('Plantilla requerida')
    .isIn(validTemplates).withMessage('Plantilla no válida'),
  // Puedes agregar más validaciones según tus necesidades
  body('psicologo').isString().notEmpty().withMessage('Psicologo requerido'),
  body('fecha').isString().notEmpty().withMessage('Fecha requerida'),
  body('hora').isString().notEmpty().withMessage('Hora requerida'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];