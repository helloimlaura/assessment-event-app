import { useEffect, useState } from 'react'

import type { GameTemplate } from '../../shared/types'
import { CreateEventForm } from './components/CreateEventForm'

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
        // Mounted only once games have arrived, so the selects are never empty
        // and the form always has a template to read defaults from.
        <CreateEventForm games={games} />
      )}
    </main>
  )
}

export default App
