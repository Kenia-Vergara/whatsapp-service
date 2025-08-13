import jwt from 'jsonwebtoken';
import { AUTH_CONFIG } from '../config/auth.config.js';

export async function login(req, res) {
  try {
    const { username, password } = req.body;

    // Buscar usuario en las credenciales hardcodeadas
    const user = AUTH_CONFIG.users.find(u => u.username === username);

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { userId: user.username, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ success: true, token, role: user.role });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export function getCurrentUser(req, res) {
  res.json({
    success: true,
    user: {
      username: req.user.username,
      role: req.user.role
    }
  });
}