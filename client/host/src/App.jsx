import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import * as XLSX from 'xlsx'
import './App.css'

function App() {
  const [gameState, setGameState] = useState('CREATE_QUIZ') // CREATE_QUIZ, START, WAITING, QUESTION, RANKING, FINAL
  const [questions, setQuestions] = useState([])
  const [editingIndex, setEditingIndex] = useState(null)
  const [newQuestion, setNewQuestion] = useState({
    text: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    timeLimit: 20
  })
  
  const [gameId, setGameId] = useState('')
  const [players, setPlayers] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [fastestPlayer, setFastestPlayer] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [token, setToken] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('connecting') // connected, connecting, disconnected
  const ws = useRef(null)
  const timerRef = useRef(null)
  
  // Web Audio API para sonidos locales
  const audioContext = useRef(null)
  const playFanfareSound = () => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = audioContext.current
    const now = ctx.currentTime
    // Melodía simple de fanfarria
    const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.2, now + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.4)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.4)
    })
  }

  // Cargar desde LocalStorage al iniciar
  useEffect(() => {
    const savedQuestions = localStorage.getItem('kahoot_quiz_draft')
    if (savedQuestions) {
      try {
        setQuestions(JSON.parse(savedQuestions))
      } catch (e) {
        console.error("Error cargando desde LocalStorage", e)
      }
    }
  }, [])

  // Guardar en LocalStorage cada vez que cambien las preguntas
  useEffect(() => {
    localStorage.setItem('kahoot_quiz_draft', JSON.stringify(questions))
  }, [questions])

  // Obtener token JWT al iniciar
  useEffect(() => {
    fetch('/api/token')
      .then(res => {
        if (res.ok) return res.json()
        throw new Error('No autenticado')
      })
      .then(data => {
        setToken(data.token)
      })
      .catch(err => {
        console.error('Error obteniendo token:', err)
        window.location.href = '/'
      })
  }, [])

  useEffect(() => {
    if (!token) return

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
    ws.current = new WebSocket(`${wsUrl}?token=${token}`)
    
    ws.current.onopen = () => {
      console.log('Host conectado al servidor con JWT')
      setConnectionStatus('connected')
      
      // Intentar recuperar partida si hay un PIN en sesión
      const savedGameId = sessionStorage.getItem('kahoot_host_gameId')
      if (savedGameId) {
        ws.current.send(JSON.stringify({
          type: 'RECLAIM_GAME',
          payload: { gameId: savedGameId }
        }))
      }
    }

    ws.current.onclose = () => {
      console.log('Socket cerrado')
      setConnectionStatus('disconnected')
    }

    ws.current.onerror = () => {
      setConnectionStatus('disconnected')
    }
    
    ws.current.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data)
      switch (type) {
        case 'ERROR':
          alert(`Error: ${payload.message}`)
          if (payload.message.includes('No se pudo recuperar')) {
            sessionStorage.removeItem('kahoot_host_gameId')
          }
          break
        case 'GAME_CREATED':
          setGameId(payload.gameId)
          sessionStorage.setItem('kahoot_host_gameId', payload.gameId)
          setGameState('WAITING')
          break
        case 'GAME_RECLAIMED':
          setGameId(payload.gameId)
          sessionStorage.setItem('kahoot_host_gameId', payload.gameId)
          setQuestions(payload.questions)
          setPlayers(payload.players)
          setCurrentQuestion(payload.currentQuestion >= 0 ? payload.questions[payload.currentQuestion] : null)
          setLeaderboard(payload.leaderboard)
          setFastestPlayer(payload.fastestPlayer)
          
          // Mapeo de estado del servidor a UI del cliente
          if (payload.status === 'waiting') setGameState('WAITING')
          else if (payload.status === 'active') setGameState('RANKING') // Volver al ranking es lo más seguro
          else if (payload.status === 'finished') setGameState('FINAL')
          break
        case 'PLAYER_JOINED':
          setPlayers(prev => [...prev, payload.name])
          break
        case 'PLAYER_LEFT':
          setPlayers(prev => prev.filter(p => p !== payload.name))
          break
        case 'PLAYER_REMOVED':
          setPlayers(prev => prev.filter(p => p !== payload.name))
          break
        case 'NEW_QUESTION':
          setCurrentQuestion(payload)
          setGameState('QUESTION')
          setTimeLeft(payload.timeLimit)
          setAnsweredCount(0)
          startTimer(payload.timeLimit)
          break
        case 'PLAYER_ANSWERED':
          setAnsweredCount(prev => prev + 1)
          break
        case 'SCORE_UPDATE':
          setLeaderboard(payload.leaderboard)
          setFastestPlayer(payload.fastestPlayer)
          setGameState('RANKING')
          break
        case 'GAME_OVER':
          setLeaderboard(payload.leaderboard)
          setFastestPlayer(payload.fastestPlayer)
          setGameState('FINAL')
          playFanfareSound()
          confetti({
            particleCount: 200,
            spread: 90,
            origin: { y: 0.6 }
          })
          break
        default:
          break
      }
    }

    return () => {
      if (ws.current) ws.current.close()
      clearInterval(timerRef.current)
    }
  }, [token])

  const startTimer = (seconds) => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // --- Lógica del Formulario ---
  const addQuestion = () => {
    if (!newQuestion.text || newQuestion.options.some(opt => !opt)) {
      alert('Por favor, rellena la pregunta y todas las opciones')
      return
    }

    if (editingIndex !== null) {
      const updatedQuestions = [...questions]
      updatedQuestions[editingIndex] = newQuestion
      setQuestions(updatedQuestions)
      setEditingIndex(null)
    } else {
      setQuestions([...questions, newQuestion])
    }

    setNewQuestion({
      text: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      timeLimit: 20
    })
  }

  const deleteQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
      setNewQuestion({
        text: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        timeLimit: 20
      })
    }
  }

  const editQuestion = (index) => {
    setNewQuestion(questions[index])
    setEditingIndex(index)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setNewQuestion({
      text: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      timeLimit: 20
    })
  }

  // --- Importar / Exportar ---
  const exportQuiz = () => {
    if (questions.length === 0) return
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(questions, null, 2))
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.setAttribute("href", dataStr)
    downloadAnchorNode.setAttribute("download", "cuestionario_kahoot.json")
    document.body.appendChild(downloadAnchorNode)
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  const importQuiz = (event) => {
    const file = event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedQuestions = JSON.parse(e.target.result)
        if (Array.isArray(importedQuestions)) {
          setQuestions(importedQuestions)
        } else {
          alert("El archivo no tiene un formato válido.")
        }
      } catch (err) {
        alert("Error al leer el archivo JSON.")
      }
    }
    reader.readAsText(file)
  }

  const exportResults = () => {
    if (leaderboard.length === 0) return

    const now = new Date()
    const fecha = now.toLocaleDateString('es-ES')
    const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

    const data = leaderboard.map((player, index) => ({
      Posición: index + 1,
      Jugador: player.name,
      Puntuación: player.score,
      'Respuestas Correctas': player.correctAnswers || 0
    }))

    const wsSheet = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsSheet, 'Resultados')

    const metaData = [
      ['Kahoot Clone - Resultados'],
      ['PIN del Juego', gameId],
      ['Fecha', fecha],
      ['Hora', hora],
      ['Total Preguntas', questions.length],
      ['Total Jugadores', leaderboard.length]
    ]
    const metaSheet = XLSX.utils.aoa_to_sheet(metaData)
    XLSX.utils.book_append_sheet(wb, metaSheet, 'Info')

    XLSX.writeFile(wb, `kahoot_resultados_${gameId}.xlsx`)
  }

  const sendMessage = (type, payload) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }))
    }
  }

  const handleCreateGame = () => {
    if (questions.length === 0) {
      alert('Añade al menos una pregunta antes de crear la partida')
      return
    }
    sendMessage('CREATE_GAME', { questions })
  }

  const handleLogout = async () => {
    try {
      await fetch('/logout', { method: 'POST' })
      window.location.href = '/'
    } catch (e) {
      console.error('Error al cerrar sesión:', e)
    }
  }

  const handleStartGame = () => {
    sendMessage('START_GAME', { gameId })
  }

  const handleShowRanking = () => {
    sendMessage('SHOW_RANKING', { gameId })
  }

  const handleNextQuestion = () => {
    sendMessage('NEXT_QUESTION', { gameId })
  }

  const handleRemovePlayer = (playerName) => {
    if (confirm(`¿Remover a ${playerName} del juego?`)) {
      sendMessage('REMOVE_PLAYER', { gameId, playerName })
    }
  }

  const getStatusText = () => {
    switch(connectionStatus) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando...';
      case 'disconnected': return 'Desconectado';
      default: return '';
    }
  }

  const handleNewGame = () => {
    sessionStorage.removeItem('kahoot_host_gameId')
    window.location.reload()
  }

  return (
    <div className="container">
      <div className={`connection-status ${connectionStatus}`}>
        <span className={`dot ${connectionStatus}`}></span>
        {getStatusText()}
      </div>

      <h1>Kahoot Clone - HOST</h1>
      <button className="btn-logout" onClick={handleLogout}>Cerrar Sesión</button>

      {/* BLOQUE: CREACIÓN DE PREGUNTAS */}
      {gameState === 'CREATE_QUIZ' && (
        <div className="screen creation-screen">
          <h2>Crear Cuestionario</h2>
          <div className="form-group">
            <input 
              type="text" 
              placeholder="Pregunta" 
              value={newQuestion.text} 
              onChange={(e) => setNewQuestion({...newQuestion, text: e.target.value})}
            />
            <div className="options-input-grid">
              {newQuestion.options.map((opt, i) => (
                <div key={i} className={`option-input-wrapper color-${i}`}>
                  <input 
                    type="text" 
                    placeholder={`Opción ${i+1}`}
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...newQuestion.options]
                      newOpts[i] = e.target.value
                      setNewQuestion({...newQuestion, options: newOpts})
                    }}
                  />
                  <input 
                    type="radio" 
                    name="correct" 
                    checked={newQuestion.correctAnswer === i}
                    onChange={() => setNewQuestion({...newQuestion, correctAnswer: i})}
                  />
                </div>
              ))}
            </div>
            <div className="form-footer">
              <label>Tiempo (seg): </label>
              <input 
                type="number" 
                value={newQuestion.timeLimit} 
                onChange={(e) => setNewQuestion({...newQuestion, timeLimit: parseInt(e.target.value)})}
                style={{ width: '60px' }}
              />
              <button className="btn-secondary" onClick={addQuestion}>
                {editingIndex !== null ? 'Guardar Cambios' : 'Añadir Pregunta'}
              </button>
              {editingIndex !== null && (
                <button className="btn-cancel" onClick={cancelEdit}>Cancelar Edición</button>
              )}
            </div>
          </div>

          <div className="questions-preview">
            <div className="preview-header">
              <h3>Preguntas añadidas: {questions.length}</h3>
              <div className="import-export-actions">
                <button className="btn-action" onClick={exportQuiz} disabled={questions.length === 0}>
                  💾 Exportar
                </button>
                <label className="btn-action label-btn">
                  📂 Importar
                  <input type="file" accept=".json" onChange={importQuiz} style={{ display: 'none' }} />
                </label>
                <button 
                  className="btn-action btn-danger-outline" 
                  onClick={() => { if(window.confirm('¿Borrar todas las preguntas?')) setQuestions([]) }}
                  disabled={questions.length === 0}
                >
                  🗑️ Limpiar
                </button>
              </div>
            </div>
            <ul>
              {questions.map((q, i) => (
                <li key={i} className="preview-item">
                  <span className="q-text">{i+1}. {q.text}</span>
                  <div className="preview-actions">
                    <button className="btn-edit" onClick={() => editQuestion(i)}>✏️</button>
                    <button className="btn-delete" onClick={() => deleteQuestion(i)}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {questions.length > 0 && (
            <button className="btn-large" onClick={handleCreateGame}>Finalizar y Crear Sala</button>
          )}
        </div>
      )}

      {gameState === 'WAITING' && (
        <div className="screen">
          <h2>PIN del Juego: <span className="pin">{gameId}</span></h2>
          <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '1rem' }}>
            Los alumnos se conectan en{' '}
            <code>{import.meta.env.VITE_WS_URL?.replace('ws://', 'http://').replace('3001', '5174')}</code>
          </p>
          <div className="players-list">
            <h3>Jugadores ({players.length}):</h3>
            <ul>
              {players.map((p, i) => (
                <li key={i}>
                  <span>{p}</span>
                  <button 
                    className="btn-remove-player" 
                    onClick={() => handleRemovePlayer(p)}
                    title="Remover jugador"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {players.length > 0 && (
            <button className="btn-primary" onClick={handleStartGame}>Iniciar Juego</button>
          )}
        </div>
      )}

      {gameState === 'QUESTION' && currentQuestion && (
        <div className="screen">
          <div className="timer">Tiempo: {timeLeft}s</div>
          <div className="stats">Respuestas: {answeredCount} / {players.length}</div>
          <h2>{currentQuestion.text}</h2>
          <div className="options-grid">
            {currentQuestion.options.map((opt, i) => {
              const isFinished = (timeLeft === 0 || (answeredCount === players.length && players.length > 0));
              const isCorrect = i === currentQuestion.correctAnswer;
              return (
                <div 
                  key={i} 
                  className={`option color-${i} ${isFinished ? (isCorrect ? 'correct' : 'incorrect') : ''}`}
                >
                  {opt}
                </div>
              );
            })}
          </div>
          {(timeLeft === 0 || (answeredCount === players.length && players.length > 0)) && (
            <button className="btn-primary" onClick={handleShowRanking}>Ver Ranking</button>
          )}
        </div>
      )}

      {gameState === 'RANKING' && (
        <div className="screen">
          <h2>Ranking Actual</h2>
          {fastestPlayer && (
            <div className="fastest-announcement">
              ⚡ ¡{fastestPlayer} fue el más rápido en esta ronda! ⚡
            </div>
          )}
          <ol className="leaderboard">
            {leaderboard.map((player, i) => (
              <li key={i}>
                <span>{player.name}</span>
                <span>{player.score} pts</span>
              </li>
            ))}
          </ol>
          <button className="btn-primary" onClick={handleNextQuestion}>Continuar</button>
        </div>
      )}

      {gameState === 'FINAL' && (
        <div className="screen">
          <h2>🏆 Fin del Juego 🏆</h2>
          <div className="podium">
            {leaderboard.slice(0, 3).map((player, i) => (
              <div key={i} className={`podium-place place-${i+1}`}>
                <div className="rank">{i+1}º</div>
                <div className="name">{player.name}</div>
                <div className="score">{player.score} pts</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={handleNewGame}>Nueva Partida</button>
          <button className="btn-secondary" onClick={exportResults} disabled={leaderboard.length === 0}>
            📊 Exportar a Excel
          </button>
        </div>
      )}
    </div>
  )
}

export default App
