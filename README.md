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
- `SUBMIT_ANSWER`: Envía una respuesta.
- `NEXT_QUESTION`: Avanza a la siguiente pregunta o muestra el ranking.
