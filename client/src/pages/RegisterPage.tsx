import { useParams } from 'react-router-dom'

import { RegistrationForm } from '../components/RegistrationForm'
import { useEventDetail } from '../lib/useEventDetail'

/** Where a scanned QR code lands. The event is loaded here so the form is
 *  handed a real event and never has to render a heading for one it is still
 *  waiting on. */
export function RegisterPage() {
  const { id } = useParams<{ id: string }>()

  /** Keyed on the id so a different event gets a fresh form rather than one
   *  still holding the previous event's typed name or outcome. */
  return <RegisterView key={id} id={id ?? ''} />
}

function RegisterView({ id }: { id: string }) {
  const load = useEventDetail(id)

  if (load.kind === 'loading') return <p aria-live="polite">Loading the event…</p>
  if (load.kind === 'missing') return <p aria-live="polite">That event does not exist.</p>
  if (load.kind === 'failed') return <p aria-live="polite">Could not load the event.</p>

  return <RegistrationForm event={load.event} />
}
