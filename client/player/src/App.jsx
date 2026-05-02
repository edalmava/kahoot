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
  const ws = useRef(null)
  const timerRef = useRef(null)
  const nameRef = useRef('')
  
  // Web Audio API para sonidos locales (sin зависимости externas)
  const audioContext = useRef(null)
  const playCorrectSound = () => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = audioContext.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  }
  const playWrongSound = () => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = audioContext.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 200
    osc.type = 'sawtooth'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  }

  // WebSocket connection - se ejecuta solo al montar componente
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
    ws.current = new WebSocket(wsUrl)

    ws.current.onopen = () => console.log('Jugador conectado al servidor')
    
    ws.current.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data)
      console.log('Mensaje recibido:', type, payload)

      switch (type) {
        case 'JOIN_SUCCESS':
          setGameState('WAITING')
          break
        case 'ERROR':
          setError(payload.message)
          break
        case 'REMOVED':
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
          if (payload.error === 'TIME_EXPIRED') {
            setGameState('FEEDBACK')
            setResult(null)
            setPointsEarned(0)
            playWrongSound()
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

    return () => {
      if (ws.current) ws.current.close()
    }
  }, []) // Sin dependencias - solo monta/desmonta

  const startTimer = (seconds) => {
    setTimeLeft(seconds)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          // No forzamos feedback aquí, dejamos que el servidor o el anfitrión controlen el flujo
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
    setError('')
    ws.current.send(JSON.stringify({
      type: 'JOIN_GAME',
      payload: { gameId, name }
    }))
  }

  const handleSubmitAnswer = (optionIndex) => {
    ws.current.send(JSON.stringify({
      type: 'SUBMIT_ANSWER',
      payload: { gameId, name, optionIndex, questionIndex: currentQuestion.index }
    }))
  }

  return (
    <div className="container">
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
          <h3>Pregunta {currentQuestion.index + 1}</h3>
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
