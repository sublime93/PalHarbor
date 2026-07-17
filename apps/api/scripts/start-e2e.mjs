import { createApp } from '../dist/app.js'

const app = createApp({ apiUrl: '', username: '', password: '' }, fetch, {
  activity: false,
  access: { username: '', password: '', allowedHosts: [], allowedOrigins: [] },
})

await app.listen({ host: '127.0.0.1', port: 4174 })

let closing = false
async function close() {
  if (closing) return
  closing = true
  await app.close()
}

process.once('SIGINT', () => void close())
process.once('SIGTERM', () => void close())
