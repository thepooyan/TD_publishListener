import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { exec } from 'child_process';
import crypto from 'crypto';
import { promisify } from 'util';
import 'dotenv/config'; // Automatically load .env file

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// CONFIGURATION
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

// Promisify the exec function to use it with async/await
const execPromise = promisify(exec);

// Load configuration from environment variables
const PORT = parseInt(process.env.PORT) || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const REPO_BRANCH = process.env.REPO_BRANCH || 'main'; // Default to 'main' branch

// Exit if the secret is not configured, as it's crucial for security
if (!WEBHOOK_SECRET) {
  console.error("FATAL: WEBHOOK_SECRET environment variable is not set. The application cannot start.");
  process.exit(1);
}

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// HONO APPLICATION
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

const app = new Hono();

/**
 * Middleware to verify the signature from GitHub/GitLab.
 * This is essential to ensure that the request is authentic.
 */
const verifySignature = async (c, next) => {
  // We need the raw request body for HMAC calculation.
  // We clone the request because reading the body consumes it,
  // and we need it again later to parse as JSON.
  const rawBody = await c.req.text();
  
  // Header name can vary by provider. GitHub uses 'X-Hub-Signature-256'.
  const signature = c.req.header('X-Hub-Signature-256');

  if (!signature) {
    console.warn('Request received without a signature.');
    return c.json({ error: 'Signature required' }, 401);
  }
  
  // Calculate the expected signature
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const expectedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

  // Use crypto.timingSafeEqual to prevent timing attacks
  const isSignatureValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isSignatureValid) {
    console.warn('Received a request with an invalid signature.');
    return c.json({ error: 'Invalid signature' }, 403);
  }

  // If the signature is valid, parse the body and attach it to the context
  // for the next handler to use.
  c.set('payload', JSON.parse(rawBody));

  await next();
};

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// ROUTES
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

// A simple root endpoint to confirm the server is running
app.get('/webhook', (c) => c.text('Git auto-deploy server is listening...'));

// The main webhook endpoint
app.post('/webhook', verifySignature, async (c) => {
  const payload = c.get('payload');
  const event = c.req.header('X-GitHub-Event'); // For GitHub

  // Only process 'push' events
  if (event !== 'push') {
    console.log(`Ignoring event: ${event}`);
    return c.json({ message: 'Event ignored' }, 200);
  }

  const pushedBranch = payload.ref?.split('/').pop();
  console.log(`Received push event for branch: ${pushedBranch}`);

  // Check if the push was to the correct branch
  if (pushedBranch !== REPO_BRANCH) {
    return c.json({ message: `Push to '${pushedBranch}' ignored. Only tracking '${REPO_BRANCH}'.` }, 200);
  }

  console.log(`✅ Valid push to '${REPO_BRANCH}' detected. Initiating git pull...`);

  try {
    // Execute the git pull command
    const { stdout, stderr } = await execPromise('git pull');
    
    console.log('--- Git Pull Output ---');
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
    console.log('--- End Git Pull ---');
    console.log('✅ Repository updated successfully.');

    // IMPORTANT: If your app needs to be restarted after a pull (e.g., to apply
    // new code changes), you must do it here. For example, using a process
    // manager like PM2:
    // console.log('Restarting application with PM2...');
    // await execPromise('pm2 restart my-app-name');

    return c.json({ success: true, message: 'Repository updated.', output: stdout });

  } catch (error) {
    console.error(`❌ Error executing git pull: ${error.message}`);
    return c.json({ success: false, message: 'Failed to update repository.' }, 500);
  }
});

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// SERVER START
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

console.log(`🚀 Server starting on http://localhost:${PORT}`);
serve({
  fetch: app.fetch,
  port: PORT,
});
