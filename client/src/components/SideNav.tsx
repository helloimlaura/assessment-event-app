import { NavLink } from 'react-router-dom'

import './SideNav.css'

interface Destination {
  to: string
  label: string
}

const DESTINATIONS: Destination[] = [
  { to: '/calendar', label: 'Schedule' },
  { to: '/events/new', label: 'New event' },
]

/** The organizer's two destinations.
 *
 *  `NavLink` sets `aria-current="page"` on the matching link by itself, so the
 *  active style keys off that attribute rather than a class of our own: the
 *  thing the styling reacts to is the same thing a screen reader announces,
 *  and they cannot come apart. */
export function SideNav() {
  return (
    <nav className="side-nav" aria-label="Sections">
      <ul className="side-nav__list">
        {DESTINATIONS.map(({ to, label }) => (
          <li key={to}>
            <NavLink className="side-nav__link" to={to}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
