import 'dotenv/config';
<<<<<<< HEAD
import { server } from './src/app.js';
import { AUTH_CONFIG } from './src/config/auth.config.js';

const PORT = process.env.PORT || 5111;

// Validar configuración de autenticación
AUTH_CONFIG.validateConfig();

server.listen(PORT, () => {
=======
import app from './src/app.js';

const PORT = process.env.PORT || 5111;
app.listen(PORT, () => {
>>>>>>> b730d8d (App)
  console.log(`Servidor WhatsApp corriendo en puerto ${PORT}`);
});