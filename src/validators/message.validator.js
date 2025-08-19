import { body, validationResult } from 'express-validator';

export const validateSendMessage = [
  body('phone')
    .isString()
    .notEmpty()
    .withMessage('El número de teléfono es requerido')
    .matches(/^[\d\s\-\+\(\)]+$/)
    .withMessage('El número de teléfono debe contener solo dígitos, espacios, guiones, paréntesis y signo +'),
  body('templateOption')
    .isString()
    .notEmpty()
    .withMessage('La opción de plantilla es requerida')
    .isIn(['cita_gratis', 'cita_pagada', 'recordatorio_cita', 'confirmacion_asistencia'])
    .withMessage('La opción de plantilla debe ser una de las opciones válidas'),
  body('psicologo')
    .isString()
    .notEmpty()
    .withMessage('El nombre del psicólogo es requerido')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre del psicólogo debe tener entre 2 y 100 caracteres'),
  body('fecha')
    .isString()
    .notEmpty()
    .withMessage('La fecha es requerida')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('La fecha debe estar en formato YYYY-MM-DD'),
  body('hora')
    .isString()
    .notEmpty()
    .withMessage('La hora es requerida')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('La hora debe estar en formato HH:MM'),
  // Validación personalizada para verificar que la fecha no sea pasada
  body('fecha').custom((value) => {
    const selectedDate = new Date(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      throw new Error('La fecha no puede ser en el pasado');
    }
    return true;
  }),
  // Validación personalizada para verificar formato de hora válido
  body('hora').custom((value) => {
    const [hours, minutes] = value.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('La hora debe estar en formato válido (00:00 - 23:59)');
    }
    return true;
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Errores de validación',
        errors: errors.array().map(error => ({
          field: error.path,
          message: error.msg,
          value: error.value
        }))
      });
    }
    next();
  }
];