# Kahoot Clone - Node.js + WebSockets

Clon simplificado de Kahoot con Node.js/WebSockets en el backend y React 19 en el frontend.

## Arquitectura

| Componente | Descripción | Puerto |
|------------|-------------|--------|
| **server/** | Node.js + `ws`. Gestiona salas y estado en memoria. | 3001 |
| **client/host/** | React 19 (ESM/Vite). Creación de cuestionarios y vista del host. | 5173 |
| **client/player/** | React 19 (ESM/Vite). Vista optimizada para móviles. | 5174 |

## Requisitos

- Node.js 18+
- npm 9+

## Instalación

```bash
npm install
cd client/host && npm install
cd ../player && npm install
```

## Ejecución

```bash
npm run dev          # Todo junto (servidor + host + player)
npm run server       # Solo servidor
npm run client:host  # Solo host
npm run client:player # Solo player
```

## Características

### Quiz y Preguntas
- Creación de cuestionarios con 4 opciones y tiempo configurable por pregunta.
- Importar/exportar cuestionarios en JSON.
- Contador de progreso: "Pregunta X de N".
- Exportar resultados a Excel (.xlsx) al finalizar.

### Sonidos (Web Audio API)
- Sin archivos externos.
- **Host**: Fanfarria al terminar el juego.
- **Player**: Melodías de acierto/error estilo Kahoot.

### Seguridad y Validación
- **Autenticación JWT**: El host usa token vía query param en WebSocket.
- **Validación de nombres**: Trim, límite 20 caracteres.
- **Bloqueo de unión**: No permite nuevos jugadores tras iniciar.

### Resiliencia
- **Reconexión de Jugadores**: 60 segundos para reconectarse sin perder puntos.
- **Reconexión del Host**: 2 minutos para retomar sala con `RECLAIM_GAME`.
- **Indicadores de estado**: LED visual de conexión en tiempo real.
- **Heartbeat**: Ping cada 30s para detectar conexiones inactivas.

## Protocolo WebSocket

Mensajes JSON: `{ "type": "EVENT_NAME", "payload": { ... } }`

### Eventos Principales

| Evento | Descripción |
|--------|-------------|
| `CREATE_GAME` | Host crea una sala. |
| `JOIN_GAME` | Jugador se une con gameId + nombre. |
| `START_GAME` | Host inicia la partida. |
| `NEW_QUESTION` | Envía pregunta (host recibe `correctAnswer`, players no). Incluye `index` y `totalQuestions`. |
| `SUBMIT_ANSWER` | Jugador responde con `optionIndex` y `questionIndex`. |
| `ANSWER_RESULT` | Resultado al jugador (correct/incorrect + puntos). |
| `SCORE_UPDATE` | Ranking actualizado. |
| `SHOW_RANKING` | Host muestra ranking entre preguntas. |
| `NEXT_QUESTION` | Host avanza a siguiente pregunta. |
| `REMOVE_PLAYER` | Host remueve jugador. |
| `GAME_OVER` | Fin del juego con ranking final. |

### Códigos de Error

| Código | Significado |
|--------|-------------|
| `TIME_EXPIRED` | Tiempo agotado. |
| `ALREADY_ANSWERED` | Ya respondió esta pregunta. |
| `WRONG_QUESTION` | Respondió pregunta incorrecta. |
| `PLAYER_NOT_FOUND` | Jugador no encontrado. |

## Variables de Entorno

Crear `.env` en la raíz:

```env
JWT_SECRET=tu_secreto_aqui
```
