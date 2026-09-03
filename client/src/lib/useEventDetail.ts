import { useEffect, useState } from 'react'

import type { EventDetail } from '../../../shared/types'

/** One value rather than a boolean pair, which would allow "loading and
 *  errored at once" — not a state either page that uses this has. */
export type EventLoad =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed' }
  | { kind: 'loaded'; event: EventDetail }

/** Loads one event. Shared by the event page and the registration form, which
 *  ask the same question of the same endpoint and have to tell a mistyped id
 *  apart from a server that fell over in the same way.
 *
 *  Callers key their view on the id so a change discards the view rather than
 *  rendering the previous event's data for a frame first. */
export function useEventDetail(id: string): EventLoad {
  const [load, setLoad] = useState<EventLoad>({ kind: 'loading' })

  useEffect(() => {
    let current = true

    fetch(`/api/events/${encodeURIComponent(id)}`)
      .then(async (res) => {
        // A mistyped id and a server that fell over get different words: one
        // message for both would send someone hunting a bug that is a typo.
        if (res.status === 404) return { kind: 'missing' } as const
        if (!res.ok) throw new Error(String(res.status))

        const { event } = (await res.json()) as { event: EventDetail }
        return { kind: 'loaded', event } as const
      })
      .then((next) => {
        // A refetch that lands after a newer one must not overwrite it.
        if (current) setLoad(next)
      })
      .catch(() => {
        if (current) setLoad({ kind: 'failed' })
      })

    return () => {
      current = false
    }
  }, [id])

  return load
}
