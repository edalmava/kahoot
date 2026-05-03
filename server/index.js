const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const messageHandler = require('./messageHandler');
const gameManager = require('./gameManager');

// Cargar variables de entorno desde .env
const ENV_FILE = path.join(__dirname, '../.env');
function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
}
loadEnv();

const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret';

// Crear servidor HTTP
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Kahoot Clone Server is running\n');
});

// Adjuntar servidor WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('Nuevo cliente intentando conectar...');
  
  // Extraer token de la query string
  const parameters = url.parse(req.url, true).query;
  const token = parameters.token;

  ws.isHost = false;
  ws.isAlive = true;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'host') {
        ws.isHost = true;
        console.log(`Host autenticado: ${decoded.username}`);
      }
    } catch (err) {
      console.log('Token inválido o expirado');
    }
  }

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    // Convertir Buffer a string si es necesario
    const messageStr = message.toString();
    messageHandler.handleMessage(ws, messageStr);
  });

  ws.on('close', () => {
    console.log('Cliente desconectado');
    gameManager.removeClient(ws);
  });

  ws.on('error', (error) => {
    console.error('Error en el socket:', error);
  });
});

// Heartbeat: verificar conexiones cada 30 segundos
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('Conexión inactiva, cerrando...');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`WebSocket server listo en ws://localhost:${PORT}`);
});
