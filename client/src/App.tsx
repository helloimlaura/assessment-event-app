import { useEffect, useState } from 'react'

function App() {
  const [message, setMessage] = useState('loading...')

  useEffect(() => {
    fetch('/api/hello')
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage('could not reach the server'))
  }, [])

  return (
    <main>
      <h1>WOTC Event App</h1>
      <p>{message}</p>
    </main>
  )
}

export default App
