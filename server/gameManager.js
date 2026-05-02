const rooms = {};

/**
 * Crea una nueva sala de juego.
 * @param {string} gameId - PIN único del juego.
 * @param {WebSocket} hostWs - Socket del anfitrión.
 */
function createRoom(gameId, hostWs, questions) {
  rooms[gameId] = {
    host: hostWs,
    players: [],
    questions: questions || [],
    currentQuestion: -1,
    status: 'waiting',
    questionExpiresAt: null,
    fastestPlayer: null,
    fastestTime: Infinity
  };
  console.log(`Sala creada: ${gameId}`);
}

/**
 * Añade un jugador a una sala.
 * @param {string} gameId - PIN del juego.
 * @param {WebSocket} playerWs - Socket del jugador.
 * @param {string} playerName - Nombre del jugador.
 */
function addPlayer(gameId, playerWs, playerName) {
  const room = rooms[gameId];
  if (!room) return { success: false, message: 'Sala no encontrada' };
  
  // Evitar nombres duplicados en la misma sala
  if (room.players.find(p => p.name === playerName)) {
    return { success: false, message: 'El nombre ya está en uso' };
  }

  room.players.push({
    ws: playerWs,
    name: playerName,
    score: 0,
    correctAnswers: 0,
    lastAnswerCorrect: false
  });
  
  console.log(`Jugador ${playerName} unido a la sala ${gameId}`);
  return { success: true, playerCount: room.players.length };
}

/**
 * Registra la respuesta de un jugador y actualiza su puntaje.
 * @param {string} gameId 
 * @param {string} playerName 
 * @param {number} optionIndex 
 */
function submitAnswer(gameId, playerName, optionIndex) {
  const room = rooms[gameId];
  if (!room || room.status !== 'active') return null;

  const now = Date.now();
  // Verificar si el tiempo ha expirado
  if (room.questionExpiresAt && now > room.questionExpiresAt) {
    console.log(`Respuesta rechazada para ${playerName}: tiempo agotado.`);
    return { error: 'TIME_EXPIRED' };
  }

  const player = room.players.find(p => p.name === playerName);
  if (!player) return null;

  // Evitar múltiples respuestas
  if (player.answeredThisQuestion) {
    return { error: 'ALREADY_ANSWERED' };
  }

  const currentQ = room.questions[room.currentQuestion];
  const isCorrect = currentQ.correctAnswer === optionIndex;

  let pointsEarned = 0;
  if (isCorrect) {
    player.correctAnswers++;
    
    // Calcular tiempo restante en milisegundos
    const timeLeftMs = Math.max(0, room.questionExpiresAt - now);
    const totalTimeMs = (currentQ.timeLimit || 20) * 1000;
    
    // Puntuación dinámica: 500 base + hasta 500 por rapidez
    const speedBonus = Math.floor((timeLeftMs / totalTimeMs) * 500);
    pointsEarned = 500 + speedBonus;
    
    player.score += pointsEarned;

    // Verificar si es el más rápido de esta pregunta
    const responseTime = totalTimeMs - timeLeftMs;
    if (responseTime < room.fastestTime) {
      room.fastestTime = responseTime;
      room.fastestPlayer = playerName;
    }
  }
  
  player.lastAnswerCorrect = isCorrect;
  player.answeredThisQuestion = true;

  return { correct: isCorrect, score: player.score, pointsEarned };
}

/**
 * Obtiene el ranking de la sala.
 * @param {string} gameId 
 */
function getLeaderboard(gameId) {
  const room = rooms[gameId];
  if (!room) return [];

  return room.players
    .map(p => ({ name: p.name, score: p.score, correctAnswers: p.correctAnswers }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Limpia el socket cuando un cliente se desconecta.
 * @param {WebSocket} ws 
 */
function removeClient(ws) {
  for (const gameId in rooms) {
    const room = rooms[gameId];
    
    // Si el que se desconecta es el host
    if (room.host === ws) {
      console.log(`Host desconectado de la sala ${gameId}. Cerrando sala.`);
      const leaderboard = getLeaderboard(gameId);
      room.players.forEach(p => {
        if (p.ws.readyState === 1) { 
          p.ws.send(JSON.stringify({ 
            type: 'GAME_OVER', 
            payload: { 
              message: 'El anfitrión se ha desconectado.',
              leaderboard: leaderboard 
            } 
          }));
        }
      });
      delete rooms[gameId];
      return;
    }

    // Si el que se desconecta es un jugador
    const playerIndex = room.players.findIndex(p => p.ws === ws);
    if (playerIndex !== -1) {
      const playerName = room.players[playerIndex].name;
      room.players.splice(playerIndex, 1);
      console.log(`Jugador ${playerName} desconectado de la sala ${gameId}`);
      
      // Notificar al host que un jugador se fue
      if (room.host.readyState === 1) {
        room.host.send(JSON.stringify({ 
          type: 'PLAYER_LEFT', 
          payload: { name: playerName, playerCount: room.players.length } 
        }));
      }
      return;
    }
  }
}

module.exports = {
  rooms,
  createRoom,
  addPlayer,
  submitAnswer,
  getLeaderboard,
  removeClient
};
