import { Hono } from 'hono'
import { $ } from 'bun'
import crypto from 'crypto'

const REPO_PATH = process.env.REPO_PATH ?? '/var/www/my-project'
const SECRET = process.env.GITHUB_SECRET

if (!SECRET) {
    console.error('FATAL: GITHUB_SECRET environment variable is not set.')
    process.exit(1)
}

const app = new Hono()

app.use('/webhook', async (c, next) => {
    const signature = c.req.header('x-hub-signature-256')
    const event = c.req.header('x-github-event')
    console.log("webhook")

    if (event !== 'push') {
        return c.text('OK', 200)
    }
    
    if (!signature) {
        console.error('Missing X-Hub-Signature-256 header.')
        return c.text('Signature mismatch', 401)
    }

    const rawBodyBuffer = await c.req.arrayBuffer()
    const rawBody = Buffer.from(rawBodyBuffer)

    const hmac = crypto.createHmac('sha256', SECRET)
    const digest = 'sha256=' + hmac.update(rawBody).digest('hex')

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
        console.error('Signature verification failed.')
        return c.text('Signature mismatch', 401)
    }

    await next()
})

app.post('/', async (c) => {
    try {
        const command = $`git -C ${REPO_PATH} pull`
        await command
        const result = await command.text()

        if (command.exitCode !== 0) {
            throw new Error(`Git command failed with exit code ${command.exitCode}`)
        }

        return c.text('Git pull successful.', 200)
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown git pull error'
        console.error(`Git pull exec error: ${error}`)
        return c.text(`Git pull failed: ${error}`, 500)
    }
})

app.get("/", async (c) => {
  return c.text("hi", 200)
})

const PORT = 3000
Bun.serve({
    fetch: app.fetch,
    port: PORT,
})

console.log(`Hono server listening on port ${PORT}.`)
