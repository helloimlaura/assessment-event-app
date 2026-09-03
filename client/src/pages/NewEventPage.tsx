import { useEffect, useState } from 'react'

import type { GameTemplate } from '../../../shared/types'
import { CreateEventForm } from '../components/CreateEventForm'

/** Owns the templates the form is built from. The fetch lives here rather than
 *  in the layout because this is the only route that needs it — the schedule
 *  should not wait on a request it never reads. */
export function NewEventPage() {
  const [games, setGames] = useState<GameTemplate[]>([])
  const [status, setStatus] = useState('Loading games…')

  useEffect(() => {
    let current = true

    fetch('/api/games')
      .then((res) => res.json())
      .then((data: { games: GameTemplate[] }) => {
        if (!current) return
        setGames(data.games)
        setStatus(data.games.length > 0 ? '' : 'No games are configured.')
      })
      .catch(() => {
        if (current) setStatus('Could not reach the server.')
      })

    return () => {
      current = false
    }
  }, [])

  // Mounted only once games have arrived, so the selects are never empty and
  // the form always has a template to read its defaults from.
  return status === '' ? <CreateEventForm games={games} /> : <p>{status}</p>
}
