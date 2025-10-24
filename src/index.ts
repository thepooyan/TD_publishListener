import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { exec } from 'node:child_process'

const app = new Hono()

const GITHUB_TOKEN = 'your-secret-token'
const REPO_PATH = '/path/to/your/repo'

app.get('/', (c) => {
  return c.text('Hello from publish automation')
})

app.post('/publish', async (c) => {
  const token = c.req.header('Authorization')
  if (!token || token !== `Bearer ${GITHUB_TOKEN}`) {
    return c.text('Unauthorized', 401)
  }

  return new Promise<Response>((resolve) => {
    exec(`git -C ${REPO_PATH} pull`, (err, stdout, stderr) => {
      if (err) {
        resolve(c.text(`Git pull failed:\n${stderr}`, 500))
      } else {
        resolve(c.text(`Git pull success:\n${stdout}`))
      }
    })
  })
})

serve({
  fetch: app.fetch,
  port: 3000,
})

console.log(`Listening on port 3000...`)
