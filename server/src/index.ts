import { createApp } from './app'
import { getDatabase } from './db'

const port = Number(process.env.PORT ?? 3001)

/** Registration links and the QR codes encoding them have to be absolute and
 *  scannable from a phone that never saw this request, so the origin is
 *  configuration rather than something read off a Host header.
 *
 *  The fallback is the Vite dev origin rather than `port`: a registration link
 *  is a route only the SPA serves, so advertising the API port would encode a
 *  path Express has no handler for. `PORT` still decides where Express listens;
 *  it no longer leaks into links it cannot answer. Point `PUBLIC_BASE_URL` at a
 *  LAN address to scan from a real phone, or at the deployed origin in
 *  production. */
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173'

const app = createApp({ db: getDatabase(), publicBaseUrl })

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  // Echoed so a wrong origin is visible at boot, not only when a scan fails.
  console.log(`Registration links point at ${publicBaseUrl}`)
})
