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
  
  // Audios para feedback
  const correctSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'))
  const wrongSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'))

  useEffect(() => {
    // Conexión WebSocket
    ws.current = new WebSocket('ws://localhost:3001')

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
            setResult(null) // Indica tiempo agotado
            setPointsEarned(0)
            wrongSound.current.play().catch(() => {})
          } else {
            setResult(payload.correct)
            setScore(payload.score)
            setPointsEarned(payload.pointsEarned || 0)
            setGameState('FEEDBACK')
            if (payload.correct) {
              correctSound.current.play().catch(() => {})
            } else {
              wrongSound.current.play().catch(() => {})
            }
          }
          clearInterval(timerRef.current)
          break
        case 'SCORE_UPDATE':
          setLeaderboard(payload.leaderboard)
          setIsFastest(payload.fastestPlayer === name)
          setGameState('RANKING')
          break;
        case 'GAME_OVER':
          setLeaderboard(payload.leaderboard)
          setGameState('FINAL')
          clearInterval(timerRef.current)
          
          // Si el jugador quedó 1º, ¡disparar confeti!
          if (payload.leaderboard && payload.leaderboard[0]?.name === name) {
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
      clearInterval(timerRef.current)
    }
  }, [name])

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
    setError('')
    ws.current.send(JSON.stringify({
      type: 'JOIN_GAME',
      payload: { gameId, name }
    }))
  }

  const handleSubmitAnswer = (optionIndex) => {
    ws.current.send(JSON.stringify({
      type: 'SUBMIT_ANSWER',
      payload: { gameId, name, optionIndex }
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
              <li key={i} className={p.name === name ? 'current-player' : ''}>
                <span>{p.name}</span>
                <span>{p.score} pts</span>
              </li>
            ))}
          </ol>
          <p>Esperando la siguiente pregunta...</p>
        </div>
      )}

      {gameState === 'FINAL' && (
        <div className="screen">
          <h2>Juego Terminado</h2>
          {leaderboard && leaderboard.length > 0 ? (
            <>
              <div className="final-rank">
                Tu posición: {leaderboard.findIndex(p => p.name === name) + 1}º
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
