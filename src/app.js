import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import messageRoutes from './routes/message.routes.js';
import authRoutes from './routes/auth.routes.js';
import { apiKeyAuth } from './middlewares/auth.middleware.js';
import jwt from 'jsonwebtoken';
import whatsappService from './services/whatsapp.service.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(helmet());

// Configurar orígenes permitidos desde variable de entorno
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:3000',
      'http://localhost:5173'
    ];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));



app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Excluir el endpoint qr-status del rate limiting
    return req.path === '/api/qr-status' || req.path === '/api/qr-status/';
  }
});

app.use(limiter);

// Rutas de autenticación (sin API key)
app.use('/api/auth', authRoutes);

// Rutas de mensajes (con API key)
app.use('/api', messageRoutes);

// WebSocket para QR status
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Verificar autenticación del token
  const token = socket.handshake.auth.token;
  if (!token) {
    socket.disconnect();
    return;
  }
  
  // Verificar JWT
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      socket.disconnect();
      return;
    }
    
    // Guardar información del usuario en el socket
    socket.userId = decoded.userId;
    socket.user = decoded;
    
    // Enviar estado inicial del QR
    const qrStatus = whatsappService.getQRStatus();
    socket.emit('qr-status-update', qrStatus);
    
    console.log('Usuario autenticado:', decoded.username);
  });
  
  // Unirse a la sala del usuario
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`Usuario ${userId} se unió a su sala`);
  });
  
  // Solicitar estado inicial
  socket.on('get-initial-status', () => {
    const qrStatus = whatsappService.getQRStatus();
    socket.emit('qr-status-update', qrStatus);
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.userId);
  });
});

// Función para emitir actualizaciones del QR a todos los clientes
export function emitQrStatusUpdate(status) {
  io.emit('qr-status-update', status);
}

// Función para emitir a un usuario específico
export function emitQrStatusToUser(userId, status) {
  io.to(`user-${userId}`).emit('qr-status-update', status);
}

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

export { server, io };