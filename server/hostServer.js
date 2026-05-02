const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cargar variables de entorno desde .env sin dependencias externas
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

const PORT = 5173;
const DIST_DIR = path.join(__dirname, '../client/host/dist');

// Configuración de autenticación
const AUTH_USER = process.env.HOST_USER || 'admin';
const AUTH_PASS = process.env.HOST_PASSWORD || 'password';
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret';
const SESSION_COOKIE = 'host_session';

// HTML de la página de login
const LOGIN_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kahoot! Host - Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #46178f 0%, #2d5e3a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-container {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      width: 100%;
      max-width: 360px;
    }
    h1 { color: #46178f; margin-bottom: 1.5rem; text-align: center; }
    .error {
      background: #fee;
      color: #c00;
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
      color: #333;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #ddd;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 1rem;
    }
    input:focus {
      outline: none;
      border-color: #46178f;
    }
    button {
      width: 100%;
      padding: 0.875rem;
      background: #46178f;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #36126f; }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>Kahoot! Host</h1>
    {{ERROR_HTML}}
    <form method="POST" action="/login">
      <label for="username">Usuario</label>
      <input type="text" id="username" name="username" required autocomplete="username">
      <label for="password">Contraseña</label>
      <input type="password" id="password" name="password" required autocomplete="current-password">
      <button type="submit">Iniciar Sesión</button>
    </form>
  </div>
</body>
</html>
`;

// Almacén de sesiones válidas
const validSessions = {};

// Generar token de sesión
function generateSessionToken(username) {
  const token = crypto.randomBytes(32).toString('hex');
  validSessions[token] = { username, createdAt: Date.now() };
  return token;
}

// Verificar sesión
function verifySession(sessionToken) {
  const session = validSessions[sessionToken];
  if (!session) return false;
  
  // Expirar después de 24 horas
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    delete validSessions[sessionToken];
    return false;
  }
  return true;
}

// Limpiar sesiones expiradas periódicamente
setInterval(() => {
  const now = Date.now();
  Object.keys(validSessions).forEach(token => {
    if (now - validSessions[token].createdAt > 24 * 60 * 60 * 1000) {
      delete validSessions[token];
    }
  });
}, 60 * 60 * 1000); // Cada hora

// Extraer cookie de sesión
function getSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(SESSION_COOKIE + '=')) {
      return cookie.split('=')[1];
    }
  }
  return null;
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const sessionToken = getSessionCookie(req.headers.cookie);
  const isAuthenticated = verifySession(sessionToken);
  
  // Rutas especiales
  if (req.method === 'POST' && req.url === '/login') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const username = params.get('username');
      const password = params.get('password');
      
      if (username === AUTH_USER && password === AUTH_PASS) {
        // Generar sesión
        const token = generateSessionToken(username);
        res.writeHead(302, {
          'Location': '/index.html',
          'Set-Cookie': SESSION_COOKIE + '=' + token + '; Path=/; HttpOnly'
        });
        res.end();
      } else {
        // Error de login
        const errorHtml = '<div class="error">Usuario o contraseña incorrectos</div>';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(LOGIN_HTML.replace('{{ERROR_HTML}}', errorHtml));
      }
    });
    return;
  }
  
  // Ruta de logout
  if (req.method === 'POST' && req.url === '/logout') {
    const sessionToken = getSessionCookie(req.headers.cookie);
    if (sessionToken && validSessions[sessionToken]) {
      delete validSessions[sessionToken];
    }
    res.writeHead(302, {
      'Location': '/',
      'Set-Cookie': SESSION_COOKIE + '=; Path=/; HttpOnly; Max-Age=0'
    });
    res.end();
    return;
  }
  
  // Si no está autenticado, mostrar login
  if (!isAuthenticated) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(LOGIN_HTML.replace('{{ERROR_HTML}}', ''));
    return;
  }
  
  // Servir archivos estáticos
  let urlPath = req.url.split('?')[0];
  
  if (urlPath.endsWith('/') || urlPath === '') {
    urlPath = '/index.html';
  }
  
  let filePath = path.join(DIST_DIR, urlPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data2);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error');
      }
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Host server escuchando en http://0.0.0.0:${PORT}`);
  console.log(`Accede desde la red LAN en http://<TU_IP>:${PORT}`);
  console.log(`Usuario: ${AUTH_USER}`);
});