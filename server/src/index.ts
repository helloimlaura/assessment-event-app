import { createApp } from './app'
import { getDatabase } from './db'

const port = Number(process.env.PORT ?? 3001)

/** Registration links and the QR codes encoding them have to be absolute and
 *  scannable from a phone that never saw this request, so the origin is
 *  configuration rather than something read off a Host header. */
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`

const app = createApp({ db: getDatabase(), publicBaseUrl })

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
