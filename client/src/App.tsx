import { useEffect, useState } from 'react'

import type { GameTemplate } from '../../shared/types'

function App() {
  const [games, setGames] = useState<GameTemplate[]>([])
  const [status, setStatus] = useState('loading games...')

  useEffect(() => {
    fetch('/api/games')
      .then((res) => res.json())
      .then((data: { games: GameTemplate[] }) => {
        setGames(data.games)
        setStatus(data.games.length > 0 ? '' : 'no games are configured')
      })
      .catch(() => setStatus('could not reach the server'))
  }, [])

  return (
    <main>
      <h1>WOTC Event App</h1>
      {status !== '' ? (
        <p>{status}</p>
      ) : (
        <ul>
          {games.map((game) => (
            <li key={game.id}>
              {game.name}
              <ul>
                {game.eventTypes.map((option) => (
                  <li key={option.eventType}>
                    {option.label} — {option.durationMin} min, up to{' '}
                    {option.maxCapacity} players
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
