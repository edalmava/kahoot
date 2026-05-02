const gameManager = require('./gameManager');

/**
 * Procesa los mensajes entrantes de los WebSockets.
 * @param {WebSocket} ws - El socket que envía el mensaje.
 * @param {string} message - El mensaje serializado como JSON.
 */
function handleMessage(ws, message) {
  try {
    const { type, payload } = JSON.parse(message);
    console.log(`Mensaje recibido: ${type}`, payload);

    switch (type) {
      case 'CREATE_GAME':
        handleCreateGame(ws, payload);
        break;
      case 'JOIN_GAME':
        handleJoinGame(ws, payload);
        break;
      case 'START_GAME':
        handleStartGame(ws, payload);
        break;
      case 'SUBMIT_ANSWER':
        handleSubmitAnswer(ws, payload);
        break;
      case 'SHOW_RANKING':
        handleShowRanking(ws, payload);
        break;
      case 'NEXT_QUESTION':
        handleNextQuestion(ws, payload);
        break;
      default:
        console.warn(`Tipo de mensaje desconocido: ${type}`);
    }
  } catch (error) {
    console.error('Error al procesar mensaje:', error);
  }
}

function handleCreateGame(ws, payload) {
  // Generar un PIN aleatorio de 4 dígitos
  const gameId = Math.floor(1000 + Math.random() * 9000).toString();
  gameManager.createRoom(gameId, ws, payload.questions);
  
  ws.send(JSON.stringify({
    type: 'GAME_CREATED',
    payload: { gameId }
  }));
}

function handleJoinGame(ws, payload) {
  const { gameId, name } = payload;
  const result = gameManager.addPlayer(gameId, ws, name);
  
  if (result.success) {
    const room = gameManager.rooms[gameId];
    // Notificar al host
    room.host.send(JSON.stringify({
      type: 'PLAYER_JOINED',
      payload: { name, playerCount: result.playerCount }
    }));
    
    // Confirmar al jugador (opcional pero útil)
    ws.send(JSON.stringify({
      type: 'JOIN_SUCCESS',
      payload: { gameId, name }
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'ERROR',
      payload: { message: result.message }
    }));
  }
}

function handleStartGame(ws, payload) {
  const { gameId } = payload;
  const room = gameManager.rooms[gameId];
  
  if (room && room.host === ws) {
    room.status = 'active';
    room.currentQuestion = 0;
    
    const question = room.questions[0];
    const timeLimit = question.timeLimit || 20;
    room.questionExpiresAt = Date.now() + (timeLimit * 1000);
    room.fastestPlayer = null;
    room.fastestTime = Infinity;

    // Resetear estado de respuesta de jugadores
    room.players.forEach(p => p.answeredThisQuestion = false);

    const questionMessageForHost = JSON.stringify({
      type: 'NEW_QUESTION',
      payload: {
        index: 0,
        text: question.text,
        options: question.options,
        timeLimit: timeLimit,
        correctAnswer: question.correctAnswer // El host necesita saber la correcta para mostrarla al final
      }
    });

    const questionMessageForPlayers = JSON.stringify({
      type: 'NEW_QUESTION',
      payload: {
        index: 0,
        text: question.text,
        options: question.options,
        timeLimit: timeLimit
        // NO enviamos correctAnswer aquí
      }
    });

    room.host.send(questionMessageForHost);
    room.players.forEach(p => p.ws.send(questionMessageForPlayers));
  }
}

function handleSubmitAnswer(ws, payload) {
  const { gameId, name, optionIndex } = payload;
  const result = gameManager.submitAnswer(gameId, name, optionIndex);
  
  if (result) {
    ws.send(JSON.stringify({
      type: 'ANSWER_RESULT',
      payload: result
    }));
    
    // Notificar al host que alguien respondió para el contador en pantalla
    const room = gameManager.rooms[gameId];
    room.host.send(JSON.stringify({
      type: 'PLAYER_ANSWERED',
      payload: { name }
    }));
  }
}

function handleShowRanking(ws, payload) {
  const { gameId } = payload;
  const room = gameManager.rooms[gameId];
  
  if (room && room.host === ws) {
    const leaderboard = gameManager.getLeaderboard(gameId);
    const scoreMessage = JSON.stringify({
      type: 'SCORE_UPDATE',
      payload: { 
        leaderboard,
        fastestPlayer: room.fastestPlayer 
      }
    });
    
    room.host.send(scoreMessage);
    room.players.forEach(p => p.ws.send(scoreMessage));
  }
}

function handleNextQuestion(ws, payload) {
  const { gameId } = payload;
  const room = gameManager.rooms[gameId];
  
  if (room && room.host === ws) {
    room.currentQuestion++;
    
    if (room.currentQuestion < room.questions.length) {
      const question = room.questions[room.currentQuestion];
      const timeLimit = question.timeLimit || 20;
      room.questionExpiresAt = Date.now() + (timeLimit * 1000);
      room.fastestPlayer = null;
      room.fastestTime = Infinity;

      // Resetear estado de respuesta de jugadores para la nueva pregunta
      room.players.forEach(p => p.answeredThisQuestion = false);

      const questionMessageForHost = JSON.stringify({
        type: 'NEW_QUESTION',
        payload: {
          index: room.currentQuestion,
          text: question.text,
          options: question.options,
          timeLimit: timeLimit,
          correctAnswer: question.correctAnswer
        }
      });

      const questionMessageForPlayers = JSON.stringify({
        type: 'NEW_QUESTION',
        payload: {
          index: room.currentQuestion,
          text: question.text,
          options: question.options,
          timeLimit: timeLimit
        }
      });
      
      // Enviar nueva pregunta
      room.host.send(questionMessageForHost);
      room.players.forEach(p => p.ws.send(questionMessageForPlayers));
    } else {
      room.status = 'finished';
      const leaderboard = gameManager.getLeaderboard(gameId);
      const gameOverMessage = JSON.stringify({
        type: 'GAME_OVER',
        payload: { 
          leaderboard,
          fastestPlayer: room.fastestPlayer 
        }
      });
      
      room.host.send(gameOverMessage);
      room.players.forEach(p => p.ws.send(gameOverMessage));
    }
  }
}

module.exports = {
  handleMessage
};
