const rooms = {};

/**
 * Envía un mensaje solo si el socket está activo.
 */
function sendTo(ws, message) {
  if (ws && ws.readyState === 1) {
    ws.send(message);
  }
}

/**
 * Crea una nueva sala de juego.
 */
function createRoom(gameId, hostWs, questions) {
  rooms[gameId] = {
    host: hostWs,
    players: new Map(), // Nombre -> Datos del jugador
    questions: questions || [],
    currentQuestion: -1,
    status: 'waiting',
    questionExpiresAt: null,
    fastestPlayer: null,
    fastestTime: Infinity,
    hostConnected: true,
    hostDisconnectTimeout: null,
    cachedLeaderboard: [] // Cache del ranking
  };
  console.log(`Sala creada: ${gameId}`);
}

function reclaimRoom(gameId, newHostWs) {
  const room = rooms[gameId];
  if (!room) return null;

  if (room.hostDisconnectTimeout) {
    clearTimeout(room.hostDisconnectTimeout);
    room.hostDisconnectTimeout = null;
  }

  room.host = newHostWs;
  room.hostConnected = true;
  
  return {
    gameId,
    status: room.status,
    questions: room.questions,
    currentQuestion: room.currentQuestion,
    players: Array.from(room.players.keys()),
    leaderboard: getLeaderboard(gameId),
    fastestPlayer: room.fastestPlayer
  };
}

/**
 * Sanitiza el nombre del jugador (trim y recorte).
 */
function sanitizeName(name) {
  if (!name) return '';
  return name.trim().slice(0, 20);
}

function addPlayer(gameId, playerWs, playerName) {
  const room = rooms[gameId];
  if (!room) return { success: false, message: 'Sala no encontrada' };
  
  const sanitized = sanitizeName(playerName);
  if (!sanitized) return { success: false, message: 'El nombre no puede estar vacío' };
  if (!/^[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9\s-]+$/.test(sanitized)) {
    return { success: false, message: 'Nombre inválido. Solo letras, números y guiones' };
  }

  const existingPlayer = room.players.get(sanitized);
  
  if (existingPlayer) {
    if (!existingPlayer.connected) {
      if (existingPlayer.disconnectTimeout) {
        clearTimeout(existingPlayer.disconnectTimeout);
        existingPlayer.disconnectTimeout = null;
      }
      existingPlayer.ws = playerWs;
      existingPlayer.connected = true;
      return { success: true, reconnect: true, playerCount: room.players.size };
    } else {
      return { success: false, message: 'El nombre ya está en uso' };
    }
  }
  
  if (room.status !== 'waiting') {
    return { success: false, message: 'El juego ya ha comenzado' };
  }
  
  room.players.set(sanitized, {
    ws: playerWs,
    name: sanitized,
    score: 0,
    correctAnswers: 0,
    lastAnswerCorrect: false,
    connected: true,
    disconnectTimeout: null,
    answeredThisQuestion: false
  });
  
  updateLeaderboardCache(gameId);
  return { success: true, reconnect: false, playerCount: room.players.size };
}

function submitAnswer(gameId, playerName, optionIndex, questionIndex) {
  const room = rooms[gameId];
  if (!room) return { error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'active') return { error: 'GAME_NOT_ACTIVE' };

  if (questionIndex !== room.currentQuestion) return { error: 'WRONG_QUESTION' };

  const now = Date.now();
  if (room.questionExpiresAt && now > room.questionExpiresAt) return { error: 'TIME_EXPIRED' };

  const sanitized = sanitizeName(playerName);
  const player = room.players.get(sanitized);
  if (!player) return { error: 'PLAYER_NOT_FOUND' };

  if (player.answeredThisQuestion) return { error: 'ALREADY_ANSWERED' };

  const currentQ = room.questions[room.currentQuestion];
  const isCorrect = currentQ.correctAnswer === optionIndex;

  let pointsEarned = 0;
  if (isCorrect) {
    player.correctAnswers++;
    const timeLeftMs = Math.max(0, room.questionExpiresAt - now);
    const totalTimeMs = (currentQ.timeLimit || 20) * 1000;
    const speedBonus = Math.floor((timeLeftMs / totalTimeMs) * 500);
    pointsEarned = 500 + speedBonus;
    player.score += pointsEarned;

    const responseTime = totalTimeMs - timeLeftMs;
    if (responseTime < room.fastestTime) {
      room.fastestTime = responseTime;
      room.fastestPlayer = sanitized;
    }
  }
  
  player.lastAnswerCorrect = isCorrect;
  player.answeredThisQuestion = true;

  updateLeaderboardCache(gameId);
  return { correct: isCorrect, score: player.score, pointsEarned };
}

function updateLeaderboardCache(gameId) {
  const room = rooms[gameId];
  if (!room) return;
  room.cachedLeaderboard = Array.from(room.players.values())
    .map(p => ({ name: p.name, score: p.score, correctAnswers: p.correctAnswers }))
    .sort((a, b) => b.score - a.score);
}

function getLeaderboard(gameId) {
  const room = rooms[gameId];
  return room ? room.cachedLeaderboard : [];
}

function removeClient(ws) {
  for (const gameId in rooms) {
    const room = rooms[gameId];
    
    if (room.host === ws) {
      room.hostConnected = false;
      room.hostDisconnectTimeout = setTimeout(() => {
        if (!room.hostConnected) {
          const gameOverMsg = JSON.stringify({ 
            type: 'GAME_OVER', 
            payload: { message: 'Anfitrión desconectado', leaderboard: getLeaderboard(gameId) } 
          });
          room.players.forEach(p => sendTo(p.ws, gameOverMsg));
          delete rooms[gameId];
        }
      }, 120000);
      return;
    }

    // Búsqueda del jugador optimizada si guardamos el nombre en el socket
    for (const [name, player] of room.players) {
      if (player.ws === ws) {
        player.connected = false;
        if (room.host.readyState === 1) {
          room.host.send(JSON.stringify({ 
            type: 'PLAYER_LEFT', 
            payload: { name: name, playerCount: Array.from(room.players.values()).filter(p => p.connected).length } 
          }));
        }

        player.disconnectTimeout = setTimeout(() => {
          if (!player.connected) {
            room.players.delete(name);
            updateLeaderboardCache(gameId);
            if (room.host.readyState === 1) {
              room.host.send(JSON.stringify({ 
                type: 'PLAYER_REMOVED', 
                payload: { name: name, playerCount: Array.from(room.players.values()).filter(p => p.connected).length } 
              }));
            }
          }
        }, 60000);
        return;
      }
    }
  }
}

function removePlayer(gameId, playerName) {
  const room = rooms[gameId];
  if (!room) return;
  
  const targetName = playerName.trim();
  const player = room.players.get(targetName);
  
  if (!player) return;
  
  sendTo(player.ws, JSON.stringify({
    type: 'REMOVED',
    payload: { message: 'Removido por el anfitrión' }
  }));
  
  if (player.ws.readyState === 1) player.ws.close();
  room.players.delete(targetName);
  updateLeaderboardCache(gameId);
  
  sendTo(room.host, JSON.stringify({
    type: 'PLAYER_REMOVED',
    payload: { name: targetName }
  }));
}

module.exports = {
  rooms,
  createRoom,
  reclaimRoom,
  addPlayer,
  submitAnswer,
  getLeaderboard,
  removeClient,
  removePlayer
};
