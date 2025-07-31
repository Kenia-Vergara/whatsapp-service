import 'dotenv/config';
import app from './src/app.js';

const PORT = process.env.PORT || 5111;
app.listen(PORT, () => {
  console.log(`Servidor WhatsApp corriendo en puerto ${PORT}`);
});