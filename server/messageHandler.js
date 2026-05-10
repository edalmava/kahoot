const gameManager = require('./gameManager');

const messageQueue = [];
let isProcessing = false;

/**
 * Añade un mensaje a la cola para su procesamiento asíncrono.
 */
function enqueueMessage(ws, message) {
  const msgId = Math.random().toString(36).substring(7);
  const enqueueTime = Date.now();
  
  let playerName = 'Sistema';
  let type = 'UNKNOWN';
  try {
    const parsed = JSON.parse(message);
    type = parsed.type;
    if (parsed.payload?.name) playerName = parsed.payload.name;
  } catch (e) {}

  messageQueue.push({ ws, message, msgId, enqueueTime, playerName, type });
  
  console.log(`[${new Date(enqueueTime).toISOString()}] [QUEUE_IN] ID: ${msgId} | Jugador: ${playerName} | Tipo: ${type}`);

  if (!isProcessing) {
    processQueue();
  }
}

/**
 * Procesa la cola de mensajes de forma secuencial evitando bloquear el event loop.
 */
async function processQueue() {
  if (messageQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const { ws, message, msgId, enqueueTime, playerName, type } = messageQueue.shift();
  const startTime = Date.now();
  const waitTime = startTime - enqueueTime;

  try {
    console.log(`[${new Date(startTime).toISOString()}] [PROCESS_START] ID: ${msgId} | Jugador: ${playerName} | Tipo: ${type} | Espera: ${waitTime}ms`);
    
    handleMessageImmediate(ws, message);
    
    const endTime = Date.now();
    const processTime = endTime - startTime;
    console.log(`[${new Date(endTime).toISOString()}] [PROCESS_END] ID: ${msgId} | Jugador: ${playerName} | Proc: ${processTime}ms | Total: ${endTime - enqueueTime}ms`);
  } catch (error) {
    console.error(`Error procesando mensaje ${msgId} de ${playerName}:`, error);
  }

  // Usar setImmediate para permitir que Node maneje otros eventos de I/O
  setImmediate(processQueue);
}

function handleMessageImmediate(ws, message) {
  const { type, payload } = JSON.parse(message);
  
  switch (type) {
    case 'CREATE_GAME': handleCreateGame(ws, payload); break;
    case 'JOIN_GAME': handleJoinGame(ws, payload); break;
    case 'START_GAME': handleStartGame(ws, payload); break;
    case 'REMOVE_PLAYER': handleRemovePlayer(ws, payload); break;
    case 'SUBMIT_ANSWER': handleSubmitAnswer(ws, payload); break;
    case 'SHOW_RANKING': handleShowRanking(ws, payload); break;
    case 'NEXT_QUESTION': handleNextQuestion(ws, payload); break;
    case 'RECLAIM_GAME': handleReclaimGame(ws, payload); break;
    default: console.warn(`Tipo desconocido: ${type}`);
  }
}

function sendTo(ws, message) {
  if (ws && ws.readyState === 1) {
    ws.send(message);
  }
}

function handleReclaimGame(ws, payload) {
  if (!ws.isHost) return sendTo(ws, JSON.stringify({ type: 'ERROR', payload: { message: 'No host' } }));
  const gameState = gameManager.reclaimRoom(payload.gameId, ws);
  if (gameState) {
    sendTo(ws, JSON.stringify({ type: 'GAME_RECLAIMED', payload: gameState }));
  } else {
    sendTo(ws, JSON.stringify({ type: 'ERROR', payload: { message: 'PIN inválido' } }));
  }
}

function handleCreateGame(ws, payload) {
  if (!ws.isHost) return;
  const gameId = Math.floor(1000 + Math.random() * 9000).toString();
  gameManager.createRoom(gameId, ws, payload.questions);
  sendTo(ws, JSON.stringify({ type: 'GAME_CREATED', payload: { gameId } }));
}

function handleJoinGame(ws, payload) {
  const result = gameManager.addPlayer(payload.gameId, ws, payload.name);
  if (result.success) {
    const room = gameManager.rooms[payload.gameId];
    sendTo(room.host, JSON.stringify({ type: 'PLAYER_JOINED', payload: { name: payload.name, playerCount: result.playerCount } }));
    sendTo(ws, JSON.stringify({ type: 'JOIN_SUCCESS', payload: { gameId: payload.gameId, name: payload.name } }));
  } else {
    sendTo(ws, JSON.stringify({ type: 'ERROR', payload: { message: result.message } }));
  }
}

function handleStartGame(ws, payload) {
  const room = gameManager.rooms[payload.gameId];
  if (room && room.host === ws && ws.isHost) {
    room.status = 'active';
    room.currentQuestion = 0;
    const q = room.questions[0];
    const timeLimit = q.timeLimit || 20;
    room.questionExpiresAt = Date.now() + (timeLimit * 1000);
    room.fastestPlayer = null;
    room.fastestTime = Infinity;
    room.players.forEach(p => p.answeredThisQuestion = false);

    const hostMsg = JSON.stringify({ type: 'NEW_QUESTION', payload: { index: 0, totalQuestions: room.questions.length, text: q.text, options: q.options, timeLimit, correctAnswer: q.correctAnswer } });
    const playerMsg = JSON.stringify({ type: 'NEW_QUESTION', payload: { index: 0, totalQuestions: room.questions.length, text: q.text, options: q.options, timeLimit } });

    sendTo(room.host, hostMsg);
    room.players.forEach(p => sendTo(p.ws, playerMsg));
  }
}

function handleSubmitAnswer(ws, payload) {
  const result = gameManager.submitAnswer(payload.gameId, payload.name, payload.optionIndex, payload.questionIndex);
  
  if (result) {
    // Siempre responder al jugador
    sendTo(ws, JSON.stringify({ type: 'ANSWER_RESULT', payload: result }));
    
    if (!result.error) {
      const room = gameManager.rooms[payload.gameId];
      if (room) {
        sendTo(room.host, JSON.stringify({ type: 'PLAYER_ANSWERED', payload: { name: payload.name } }));
      }
    } else {
      console.warn(`[SUBMIT_REJECTED] Jugador: ${payload.name} | Motivo: ${result.error} | Sala: ${payload.gameId}`);
    }
  } else {
    // Caso de seguridad: si result es falsy por algún motivo inesperado
    console.error(`[SUBMIT_ERROR] Error crítico procesando respuesta de ${payload.name}`);
    sendTo(ws, JSON.stringify({ type: 'ANSWER_RESULT', payload: { error: 'INTERNAL_ERROR' } }));
  }
}

function handleShowRanking(ws, payload) {
  const room = gameManager.rooms[payload.gameId];
  if (room && room.host === ws && ws.isHost) {
    const msg = JSON.stringify({ type: 'SCORE_UPDATE', payload: { leaderboard: gameManager.getLeaderboard(payload.gameId), fastestPlayer: room.fastestPlayer } });
    sendTo(room.host, msg);
    room.players.forEach(p => sendTo(p.ws, msg));
  }
}

function handleNextQuestion(ws, payload) {
  const room = gameManager.rooms[payload.gameId];
  if (room && room.host === ws && ws.isHost) {
    room.currentQuestion++;
    if (room.currentQuestion < room.questions.length) {
      const q = room.questions[room.currentQuestion];
      const timeLimit = q.timeLimit || 20;
      room.questionExpiresAt = Date.now() + (timeLimit * 1000);
      room.fastestPlayer = null;
      room.fastestTime = Infinity;
      room.players.forEach(p => p.answeredThisQuestion = false);

      const hostMsg = JSON.stringify({ type: 'NEW_QUESTION', payload: { index: room.currentQuestion, totalQuestions: room.questions.length, text: q.text, options: q.options, timeLimit, correctAnswer: q.correctAnswer } });
      const playerMsg = JSON.stringify({ type: 'NEW_QUESTION', payload: { index: room.currentQuestion, totalQuestions: room.questions.length, text: q.text, options: q.options, timeLimit } });
      sendTo(room.host, hostMsg);
      room.players.forEach(p => sendTo(p.ws, playerMsg));
    } else {
      room.status = 'finished';
      const msg = JSON.stringify({ type: 'GAME_OVER', payload: { leaderboard: gameManager.getLeaderboard(payload.gameId), fastestPlayer: room.fastestPlayer } });
      sendTo(room.host, msg);
      room.players.forEach(p => sendTo(p.ws, msg));
    }
  }
}

function handleRemovePlayer(ws, payload) {
  if (!ws.isHost) return;
  const room = gameManager.rooms[payload.gameId];
  if (!room) return;
  const pName = payload.playerName.trim();
  if (!room.players.has(pName)) {
    sendTo(ws, JSON.stringify({ type: 'PLAYER_REMOVED', payload: { name: pName, error: 'NOT_FOUND' } }));
    return;
  }
  gameManager.removePlayer(payload.gameId, pName);
}

module.exports = {
  handleMessage: enqueueMessage
};
