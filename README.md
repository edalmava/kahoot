# Kahoot Clone - Node.js + WebSockets Puros

Este proyecto es un clon simplificado de Kahoot desarrollado con Node.js en el backend y React en el frontend, utilizando WebSockets nativos (`ws` en el servidor y `new WebSocket()` en el navegador).

## Arquitectura

- **Servidor**: Node.js con `ws`. Gestiona salas, jugadores y estado del juego en memoria.
- **Host (Anfitrión)**: Aplicación React para mostrar las preguntas, PIN de sala y ranking.
- **Player (Jugador)**: Aplicación React optimizada para móviles para unirse a partidas y responder.

## Requisitos

- Node.js (v14 o superior)
- npm

## Instalación

1. Clona el repositorio.
2. Instala las dependencias en la raíz:
   ```bash
   npm install
   ```
3. Instala las dependencias de los clientes:
   ```bash
   cd client/host && npm install
   cd ../player && npm install
   cd ../..
   ```

## Ejecución

Para ejecutar todo el sistema (servidor + host + player) en paralelo:

```bash
npm run dev
```

Esto levantará:
- **Servidor**: http://localhost:3001
- **Host**: http://localhost:5173
- **Player**: http://localhost:5174

## Características Implementadas

### Seguridad y Validación
- **Autenticación JWT (Host)**: El anfitrión debe autenticarse mediante JWT para realizar acciones administrativas. El token se valida en el handshake del WebSocket.
- **Validación de nombres**: Sanitización (trim, límite 20 chars) y validación de caracteres.
- **Bloqueo de unión**: No permite nuevos jugadores una vez iniciado el juego (excepto reconexiones).

### Resiliencia y Conexiones
- **Reconexión de Jugadores**: Los jugadores disponen de 60 segundos para reconectarse tras una pérdida de red sin perder sus puntos ni posición.
- **Reconexión del Host**: Las salas permanecen activas durante 2 minutos tras la desconexión del anfitrión, permitiéndole retomar el control mediante `RECLAIM_GAME`.
- **Indicadores de Estado**: Tanto el Host como los Jugadores tienen un indicador visual (LED + texto) del estado de su conexión WebSocket en tiempo real.
- **Heartbeat**: Ping cada 30 segundos para detectar conexiones inactivas.
- **Broadcasting seguro**: Función `sendTo()` que verifica `readyState` antes de enviar.

## Protocolo de Comunicación

Los mensajes se envían como strings JSON con la estructura:
```json
{
  "type": "NOMBRE_DEL_EVENTO",
  "payload": { ... datos ... }
}
```

### Eventos Principales
- `CREATE_GAME`: Crea una sala.
- `JOIN_GAME`: Un jugador se une a una sala.
- `START_GAME`: Inicia la partida.
- `SUBMIT_ANSWER`: Envía una respuesta (incluye `questionIndex`).
- `NEXT_QUESTION`: Avanza a la siguiente pregunta o muestra el ranking.
- `REMOVE_PLAYER`: El host remueve a un jugador.
- `PLAYER_REMOVED`: Notifica al host que un jugador fue removido.

### Códigos de Error
- `TIME_EXPIRED`: El tiempo de la pregunta se agotó.
- `ALREADY_ANSWERED`: El jugador ya respondió.
- `WRONG_QUESTION`: El jugador respondió una pregunta que no es la actual.