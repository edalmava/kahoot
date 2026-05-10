import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import './App.css'

function App() {
  const [gameState, setGameState] = useState('JOIN') // JOIN, WAITING, ANSWER, FEEDBACK, FINAL
  const [gameId, setGameId] = useState('')
  const [name, setName] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [result, setResult] = useState(null)
  const [score, setScore] = useState(0)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [leaderboard, setLeaderboard] = useState([])
  const [isFastest, setIsFastest] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState('connecting') // connected, connecting, disconnected
  const ws = useRef(null)
  const timerRef = useRef(null)
  const reconnectInterval = useRef(null)
  const audioContext = useRef(null)
  const nameRef = useRef(sessionStorage.getItem('kahoot_name') || '')

  const getAudioContext = () => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioContext.current
  }

  const playCorrectSound = () => {
    try {
      const ctx = getAudioContext()
      const now = ctx.currentTime
      const notes = [523, 659, 784, 1047]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.25, now + i * 0.12)
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.3)
        osc.start(now + i * 0.12)
        osc.stop(now + i * 0.12 + 0.3)
      })
    } catch (e) {
      console.error('Error playing correct sound:', e)
    }
  }

  const playWrongSound = () => {
    try {
      const ctx = getAudioContext()
      const now = ctx.currentTime
      const notes = [350, 280, 220]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sawtooth'
        gain.gain.setValueAtTime(0.15, now + i * 0.15)
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.35)
        osc.start(now + i * 0.15)
        osc.stop(now + i * 0.15 + 0.35)
      })
    } catch (e) {
      console.error('Error playing wrong sound:', e)
    }
  }
  
  // Cargar datos de sesión al iniciar
  useEffect(() => {
    const savedGameId = sessionStorage.getItem('kahoot_gameId')
    const savedName = sessionStorage.getItem('kahoot_name')
    if (savedGameId) setGameId(savedGameId)
    if (savedName) setName(savedName)
  }, [])

  const connectWS = () => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
    
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    console.log('Intentando conectar al WebSocket...')
    setConnectionStatus('connecting')
    const socket = new WebSocket(wsUrl)
    ws.current = socket

    socket.onopen = () => {
      console.log('Jugador conectado al servidor')
      setConnectionStatus('connected')
      setError('')
      clearInterval(reconnectInterval.current)
      reconnectInterval.current = null

      // Auto-rejoin si tenemos datos de sesión
      const savedGameId = sessionStorage.getItem('kahoot_gameId')
      const savedName = sessionStorage.getItem('kahoot_name')
      if (savedGameId && savedName) {
        socket.send(JSON.stringify({
          type: 'JOIN_GAME',
          payload: { gameId: savedGameId, name: savedName }
        }))
      }
    }
    
    socket.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data)
      console.log('Mensaje recibido:', type, payload)

      switch (type) {
        case 'JOIN_SUCCESS':
          setGameState('WAITING')
          break
        case 'ERROR':
          // No borrar datos de sesión en caso de error de join (puede ser PIN temporalmente inválido al reconectar)
          setError(payload.message)
          break
        case 'REMOVED':
          sessionStorage.clear()
          setError(payload.message || 'Has sido removido del juego')
          setGameState('REMOVED')
          break
        case 'NEW_QUESTION':
          setCurrentQuestion(payload)
          setGameState('ANSWER')
          setResult(null)
          setPointsEarned(0)
          setIsFastest(false)
          startTimer(payload.timeLimit)
          break
        case 'ANSWER_RESULT':
          console.log(`[${new Date().toISOString()}] [CLIENT_RECEIVE] ANSWER_RESULT recibida`);
          if (payload.error) {
            console.error(`Error en respuesta: ${payload.error}`);
            if (payload.error === 'TIME_EXPIRED') {
              setGameState('FEEDBACK')
              setResult(null)
              setPointsEarned(0)
              playWrongSound()
            } else {
              // Otros errores (PLAYER_NOT_FOUND, WRONG_QUESTION, etc.)
              setError(`Error: ${payload.error}`);
              setGameState('JOIN'); // Devolver al inicio o manejar según sea necesario
            }
          } else {
            setResult(payload.correct)
            setScore(payload.score)
            setPointsEarned(payload.pointsEarned || 0)
            setGameState('FEEDBACK')
            if (payload.correct) {
              playCorrectSound()
            } else {
              playWrongSound()
            }
          }
          clearInterval(timerRef.current)
          break
        case 'SCORE_UPDATE':
          setLeaderboard(payload.leaderboard)
          setIsFastest(payload.fastestPlayer === nameRef.current)
          setGameState('RANKING')
          break;
        case 'GAME_OVER':
          setLeaderboard(payload.leaderboard)
          setGameState('FINAL')
          clearInterval(timerRef.current)
          sessionStorage.clear()
          
          if (payload.leaderboard && payload.leaderboard[0]?.name === nameRef.current) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            });
          }
          break
        default:
          break
      }
    }

    socket.onclose = () => {
      console.log('Socket cerrado')
      setConnectionStatus('disconnected')
      startReconnecting()
    }

    socket.onerror = (err) => {
      console.error('Error en socket:', err)
      setConnectionStatus('disconnected')
      socket.close()
    }
  }

  const startReconnecting = () => {
    if (reconnectInterval.current) return
    reconnectInterval.current = setInterval(() => {
      connectWS()
    }, 3000)
  }

  // WebSocket connection management
  useEffect(() => {
    connectWS()
    return () => {
      if (ws.current) ws.current.close()
      if (reconnectInterval.current) clearInterval(reconnectInterval.current)
    }
  }, [])

  const startTimer = (seconds) => {
    setTimeLeft(seconds)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          // Bloquear interfaz localmente al agotar tiempo
          setGameState('FEEDBACK')
          setResult(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleJoin = (e) => {
    e.preventDefault()
    if (!gameId || !name) return
    nameRef.current = name // Guardar nombre para usar en effects
    
    // Guardar en sesión para reconexiones
    sessionStorage.setItem('kahoot_gameId', gameId)
    sessionStorage.setItem('kahoot_name', name)
    
    setError('')
    ws.current.send(JSON.stringify({
      type: 'JOIN_GAME',
      payload: { gameId, name }
    }))
  }

  const handleSubmitAnswer = (optionIndex) => {
    if (gameState !== 'ANSWER' || timeLeft <= 0) return

    console.log(`[${new Date().toISOString()}] [CLIENT_SEND] Enviando SUBMIT_ANSWER para opción ${optionIndex}`);
    setGameState('WAITING_RESULT')
    ws.current.send(JSON.stringify({
      type: 'SUBMIT_ANSWER',
      payload: { gameId, name, optionIndex, questionIndex: currentQuestion.index }
    }))
  }

  const getStatusText = () => {
    switch(connectionStatus) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Reconectando...';
      case 'disconnected': return 'Desconectado';
      default: return '';
    }
  }

  return (
    <div className="container">
      <div className={`connection-status ${connectionStatus}`}>
        <span className={`dot ${connectionStatus}`}></span>
        {getStatusText()}
      </div>

      {gameState !== 'JOIN' && gameState !== 'REMOVED' && (
        <div className="player-info-bar">
          <span className="player-name-tag">👤 {nameRef.current}</span>
          <span className="game-pin-tag">📍 PIN: {gameId}</span>
        </div>
      )}
      
      <h1>Kahoot! Player</h1>

      {gameState === 'JOIN' && (
        <form className="screen" onSubmit={handleJoin}>
          <input 
            type="text" 
            placeholder="PIN del Juego" 
            value={gameId} 
            onChange={(e) => setGameId(e.target.value)} 
            required
          />
          <input 
            type="text" 
            placeholder="Tu Nombre" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            required
          />
          <button className="btn-primary" type="submit">Unirme</button>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      {gameState === 'WAITING' && (
        <div className="screen">
          <p>¡Te has unido!</p>
          <h2>Hola, {name} 👋</h2>
          <p>Esperando que el anfitrión inicie el juego...</p>
        </div>
      )}

      {gameState === 'ANSWER' && currentQuestion && (
        <div className="screen">
          <h3>Pregunta {currentQuestion.index + 1} de {currentQuestion.totalQuestions}</h3>
          <div className="options-grid">
            {currentQuestion.options.map((_, i) => (
              <button 
                key={i} 
                className={`option-btn color-${i}`} 
                onClick={() => handleSubmitAnswer(i)}
              />
            ))}
          </div>
        </div>
      )}

      {gameState === 'WAITING_RESULT' && (
        <div className="screen">
          <div className="loader"></div>
          <p>Enviando respuesta...</p>
        </div>
      )}

      {gameState === 'FEEDBACK' && (
        <div className="screen feedback">
          {result === true && (
            <div className="result-container correct">
              <div className="result-icon">✅ Correcto</div>
              <div className="points-plus">+{pointsEarned}</div>
            </div>
          )}
          {result === false && (
            <div className="result-container incorrect">
              <div className="result-icon">❌ Incorrecto</div>
              <div className="points-plus">+0</div>
            </div>
          )}
          {result === null && <p>¡Tiempo agotado!</p>}
          <div className="score-display-small">Puntaje Total: {score}</div>
        </div>
      )}

      {gameState === 'RANKING' && (
        <div className="screen">
          <h2>Posiciones</h2>
          {isFastest && (
            <div className="fastest-badge">
              ⚡ ¡Has sido el más rápido! ⚡
            </div>
          )}
          <div className="score-display">Puntaje Total: {score}</div>
          <ol className="leaderboard">
            {leaderboard.map((p, i) => (
              <li key={i} className={p.name === nameRef.current ? 'current-player' : ''}>
                <span>{p.name}</span>
                <span>{p.score} pts</span>
              </li>
            ))}
          </ol>
          <p>Esperando la siguiente pregunta...</p>
        </div>
      )}

      {gameState === 'REMOVED' && (
        <div className="screen">
          <h2>Has sido removido</h2>
          <p className="error-message">{error}</p>
          <p>Espera al próximo round!</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Salir</button>
        </div>
      )}

      {gameState === 'FINAL' && (
        <div className="screen">
          <h2>Juego Terminado</h2>
          {leaderboard && leaderboard.length > 0 ? (
            <>
              <div className="final-rank">
                Tu posición: {leaderboard.findIndex(p => p.name === nameRef.current) + 1}º
              </div>
              <div className="final-score">Puntaje Final: {score} pts</div>
            </>
          ) : (
            <p>La partida ha finalizado inesperadamente.</p>
          )}
          <button className="btn-primary" onClick={() => window.location.reload()}>Salir</button>
        </div>
      )}
    </div>
  )
}

export default App
