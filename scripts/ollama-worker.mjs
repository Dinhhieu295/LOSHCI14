import { setTimeout as delay } from 'node:timers/promises';

const [server = 'https://loshci14-local-ai-api.onrender.com'] = process.argv.slice(2);
const url = new URL(server);
const token = process.env.OLLAMA_WORKER_TOKEN;
const ollama = 'http://127.0.0.1:11434';
const model = 'qwen3.5:2b-q4_K_M';
if (!token || token.length < 32) throw new Error('Set OLLAMA_WORKER_TOKEN before running this script.');
if (url.protocol !== 'https:' && url.origin !== 'http://127.0.0.1:' + url.port) {
  throw new Error('The LifeOS backend URL must use HTTPS or a local test address.');
}

const relay = new URL('/api/assistant/ollama-worker/job', url);
const headers = { Authorization: `Bearer ${token}` };
const request = (target, options, timeout) => fetch(target, {
  ...options, redirect: 'error', signal: AbortSignal.timeout(timeout),
});

const models = await request(`${ollama}/api/tags`, {}, 5000);
if (!models.ok || !(await models.json()).models?.some((entry) => entry.name === model)) {
  throw new Error(`Start Ollama and install ${model} before starting the worker.`);
}

let connected = false;
while (true) {
  let job;
  try {
    const response = await request(relay, { headers }, 30_000);
    if (response.status === 401) throw new Error('Authentication failed.');
    if (response.status !== 204 && !response.ok) throw new Error('LifeOS relay did not accept the request.');
    if (!connected) console.log('Ollama worker connected to LifeOS.');
    connected = true;
    if (response.status === 204) {
      await delay(1250);
      continue;
    }
    job = await response.json();
  } catch (error) {
    if (error?.message === 'Authentication failed.') throw error;
    if (connected) console.log('Lost the connection to LifeOS. Retrying.');
    connected = false;
    await delay(4000);
    continue;
  }

  let result = { failed: true };
  try {
    const response = await request(`${ollama}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job.payload, model, stream: false }),
    }, 75_000);
    if (response.ok) result = { data: await response.json() };
  } catch {
    // Report model failures to the web app without printing requests or responses.
  }

  try {
    const response = await request(`${relay.href}/${encodeURIComponent(job.id)}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(result),
    }, 20_000);
    if (!response.ok) throw new Error('LifeOS did not accept the result.');
  } catch {
    console.log('Could not return a model response to LifeOS.');
  }
}
