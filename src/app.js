import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import messageRoutes from './routes/message.routes.js';
import authRoutes from './routes/auth.routes.js';
import { apiKeyAuth } from './middlewares/auth.middleware.js';

const app = express();

app.use(helmet());
app.use(cors({
  //origin: ['https://tudominio.com', 'http://localhost:3000'], // Ajusta según tus clientes
  origin: ['*'],
  credentials: true,
}));
app.use(express.json());

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests por 15 minutos
  standardHeaders: true,
  legacyHeaders: false,
}));

// Rutas de autenticación (sin API key)
app.use('/api/auth', authRoutes);

// Rutas de mensajes (con API key)
app.use('/api', messageRoutes);

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

export default app;