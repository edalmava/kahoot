const http = require('http');
const { WebSocketServer } = require('ws');
const messageHandler = require('./messageHandler');
const gameManager = require('./gameManager');

const PORT = 3001;

// Crear servidor HTTP
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Kahoot Clone Server is running\n');
});

// Adjuntar servidor WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Nuevo cliente conectado');
  
  ws.isAlive = true;
  
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
