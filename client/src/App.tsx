import { useEffect, useState } from 'react'

import type { GameTemplate } from '../../shared/types'
import { CreateEventForm } from './components/CreateEventForm'
import { EventAgenda } from './components/EventAgenda'

function App() {
  const [games, setGames] = useState<GameTemplate[]>([])
  const [status, setStatus] = useState('loading games...')
  /** Bumped on every create, which is the agenda's cue to refetch — the new
   *  event appears in the schedule without a reload. */
  const [scheduleVersion, setScheduleVersion] = useState(0)

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
    <main className="app">
      <h1>WOTC Event App</h1>
      {status !== '' ? (
        <p>{status}</p>
      ) : (
        // Mounted only once games have arrived, so the selects are never empty
        // and the form always has a template to read defaults from.
        <CreateEventForm
          games={games}
          onCreated={() => setScheduleVersion((v) => v + 1)}
        />
      )}
      {/* The agenda does not need the templates, so it renders whatever the
          games request did. */}
      <EventAgenda refreshKey={scheduleVersion} />
    </main>
  )
}

export default App
