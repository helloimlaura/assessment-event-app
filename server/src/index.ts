import express from 'express'

const app = express()
const port = 3001

app.use(express.json())

app.get('/api/hello', (_req, res) => {
  res.json({ message: 'Hello from the server' })
})

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
