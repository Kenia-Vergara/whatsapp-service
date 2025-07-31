export function getTemplate(option, params = {}) {
  const {
    nombrePsicologo = '',
    fecha = '',
    hora = ''
  } = params;

  switch (option) {
    case 'cita_gratis':
      return `¡Hola 👋

✅ Tu primera cita GRATUITA ha sido confirmada:

📅 Fecha: ${fecha}
🕐 Hora: ${hora}
👨‍⚕️ Psicólogo: ${nombrePsicologo}

🎉 ¡Recuerda que tu primera consulta es completamente GRATIS!

Si tienes alguna consulta, no dudes en contactarnos.

¡Te esperamos! 🌟`;

    case 'cita_pagada':
      return `¡Hola 👋

✅ Tu cita ha sido confirmada:

📅 Fecha: ${fecha}
🕐 Hora: ${hora}
👨‍⚕️ Psicólogo: ${nombrePsicologo}

Por favor, realiza el pago antes de la consulta para confirmar tu reserva.

Si tienes dudas, contáctanos.

¡Gracias por confiar en nosotros!`;

    case 'recordatorio_cita':
      return `¡Hola 👋

⏰ Te recordamos tu cita próxima:

📅 Fecha: ${fecha}
🕐 Hora: ${hora}
👨‍⚕️ Psicólogo: ${nombrePsicologo}

Por favor, confirma tu asistencia respondiendo a este mensaje.

¡Nos vemos pronto!`;

    case 'confirmacion_asistencia':
      return `¡Hola 👋

✅ Hemos recibido tu confirmación de asistencia para la cita:

📅 Fecha: ${fecha}
🕐 Hora: ${hora}
👨‍⚕️ Psicólogo: ${nombrePsicologo}

¡Gracias por avisarnos!`;

    default:
      return 'Opción de plantilla no válida.';
  }
}
