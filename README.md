# WhatsApp Service

Servicio de WhatsApp que permite enviar mensajes usando plantillas predefinidas. **El código QR ya no se genera automáticamente al iniciar la aplicación.**

## 🚀 Características

- ✅ **Sin generación automática de QR**: El servicio no se conecta automáticamente a WhatsApp
- 🔐 **Autenticación JWT**: Sistema de autenticación seguro
- 📱 **Plantillas de mensajes**: Mensajes predefinidos para diferentes casos de uso
- 📊 **Rate limiting**: Control de frecuencia para solicitudes de QR
- 🔒 **Autorización por roles**: Diferentes niveles de acceso (admin, user)

## 📋 Requisitos

- Node.js 18+
- Cuenta de WhatsApp
- Variables de entorno configuradas

## ⚙️ Instalación

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd whatsapp-service
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.template .env
# Editar .env con tus credenciales
```

4. **Iniciar el servicio**
```bash
npm start
```

## 🔌 Uso de la API

### 1. Iniciar Conexión a WhatsApp

**POST** `/api/start-connection`

Inicia la conexión a WhatsApp manualmente. Solo administradores pueden usar este endpoint.

```bash
curl -X POST http://localhost:5111/api/start-connection \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Iniciando conexión a WhatsApp",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 2. Solicitar Código QR

**POST** `/api/qr-request`

Solicita un nuevo código QR para autenticarse en WhatsApp.

```bash
curl -X POST http://localhost:5111/api/qr-request \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Solicitud de nuevo QR procesada. Se generará automáticamente.",
  "estimatedWaitTime": "5-10 segundos",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 3. Obtener Código QR

**GET** `/api/qr-code`

Obtiene el código QR actual si está disponible.

```bash
curl -X GET http://localhost:5111/api/qr-code \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 4. Ver Estado de Conexión

**GET** `/api/status`

Verifica el estado actual de la conexión con WhatsApp.

```bash
curl -X GET http://localhost:5111/api/status \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 5. Enviar Mensaje

**POST** `/api/send-message`

Envía un mensaje usando una plantilla predefinida.

```bash
curl -X POST http://localhost:5111/api/send-message \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "34612345678",
    "templateOption": "recordatorio",
    "psicologo": "Dr. García",
    "fecha": "15/01/2024",
    "hora": "10:00"
  }'
```

## 🔐 Autenticación

### Login

**POST** `/api/auth/login`

```bash
curl -X POST http://localhost:5111/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "token": "JWT_TOKEN_HERE",
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

## 📱 Flujo de Uso

1. **Iniciar el servicio** - El servicio se inicia sin conectarse a WhatsApp
2. **Autenticarse** - Obtener JWT token mediante login
3. **Iniciar conexión** - Llamar a `/api/start-connection` para conectar con WhatsApp
4. **Solicitar QR** - Llamar a `/api/qr-request` para generar código QR
5. **Obtener QR** - Llamar a `/api/qr-code` para obtener el código QR
6. **Escanear QR** - Usar WhatsApp para escanear el código
7. **Enviar mensajes** - Una vez conectado, usar `/api/send-message`

## ⚠️ Limitaciones de Rate Limiting

- **Máximo 10 QR por hora** por usuario
- **Mínimo 30 segundos** entre solicitudes de QR
- **QR expira en 1 minuto** por seguridad

## 🐳 Docker

```bash
# Construir imagen
docker build -t whatsapp-service .

# Ejecutar contenedor
docker run -p 5111:5111 --env-file .env whatsapp-service
```

## 🔧 Variables de Entorno

```env
# Puerto del servidor
PORT=5111

# Credenciales de usuario
USER_USERNAME=usuario
USER_PASSWORD=usuario123
USER_ROLE=user

# Credenciales de administrador
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_ROLE=admin

# JWT Secret
JWT_SECRET=tu_jwt_secret_aqui
```

## 📝 Notas Importantes

- **El servicio NO se conecta automáticamente** a WhatsApp al iniciar
- **Siempre debes llamar a `/api/start-connection`** antes de solicitar un QR
- **Los códigos QR expiran por seguridad** después de 1 minuto
- **Solo administradores** pueden iniciar conexiones y solicitar QR
- **El servicio no reconecta automáticamente** si se pierde la conexión

## 🚨 Solución de Problemas

### Error: "WhatsApp no está conectado"
- Asegúrate de haber llamado a `/api/start-connection` primero
- Verifica que el QR haya sido escaneado correctamente

### Error: "Rate limit excedido"
- Espera el tiempo indicado antes de solicitar otro QR
- Revisa las estadísticas con `/api/qr-stats`

### Error: "QR expirado"
- Solicita un nuevo QR con `/api/qr-request`
- Los QR expiran automáticamente por seguridad
