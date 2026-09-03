import { Navigate, Route, Routes } from 'react-router-dom'

import { EventAgenda } from './components/EventAgenda'
import { SideNav } from './components/SideNav'
import { EventPage } from './pages/EventPage'
import { NewEventPage } from './pages/NewEventPage'

/** The layout shell and the route table. Each view owns the data it needs, so
 *  this holds no state of its own. */
function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>WOTC Event App</h1>
      </header>

      <SideNav />

      <main className="app__content">
        <Routes>
          {/* The schedule is the organizer's home: the first question is
              almost always what is already on the calendar. */}
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<EventAgenda />} />
          {/* Static before dynamic, so a later `/events/:id` cannot swallow
              this one. React Router ranks it that way regardless of order. */}
          <Route path="/events/new" element={<NewEventPage />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="*" element={<p>That page does not exist.</p>} />
        </Routes>
      </main>
    </div>
  )
}

export default App
