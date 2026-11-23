import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { json, Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';

type Payload = Record<string, unknown>;
type Job = {
  payload: Payload;
  claimed: boolean;
  resolve: (data: unknown) => void;
  reject: (cause: unknown) => void;
};

const jobs = new Map<string, Job>();
let lastPoll = 0;
const workerToken = config.OLLAMA_WORKER_TOKEN;
export const ollamaRelayEnabled = Boolean(workerToken && config.OLLAMA_ACCESS_CODE);
const hash = (text: string) => createHash('sha256').update(text).digest();
const matches = (input: string, secret: string) => timingSafeEqual(hash(input), hash(secret));
const result = z.union([z.strictObject({ data: z.unknown() }), z.strictObject({ failed: z.literal(true) })]);

export function checkOllamaAccess(code: string) {
  if (ollamaRelayEnabled && !matches(code, config.OLLAMA_ACCESS_CODE!)) {
    throw new HttpError(403, 'Mã kết nối Ollama không hợp lệ.', 'OLLAMA_ACCESS_DENIED');
  }
}

export async function askOllamaWorker(payload: Payload, signal: AbortSignal) {
  const workerBusy = [...jobs.values()].some((job) => job.claimed);
  if (Date.now() - lastPoll > 20_000 && !workerBusy) {
    throw new HttpError(503, 'Máy chạy Ollama đang ngoại tuyến. Hãy mở tiến trình kết nối rồi thử lại.', 'OLLAMA_WORKER_OFFLINE');
  }
  if (jobs.size >= 5) throw new HttpError(503, 'Ollama đang xử lý các yêu cầu khác. Hãy thử lại sau.', 'OLLAMA_WORKER_BUSY');
  signal.throwIfAborted();
  const id = randomUUID();
  let abort: () => void;
  try {
    return await new Promise<unknown>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      jobs.set(id, { payload, claimed: false, resolve, reject });
    });
  } finally {
    signal.removeEventListener('abort', abort!);
    jobs.delete(id);
  }
}

export function createOllamaWorkerRouter() {
  const router = Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (!workerToken || !matches(request.get('Authorization') ?? '', `Bearer ${workerToken}`)) {
      response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Tiến trình Ollama chưa xác thực.' } });
      return;
    }
    next();
  });
  router.get('/job', (_request, response) => {
    lastPoll = Date.now();
    for (const [id, job] of jobs) {
      if (job.claimed) continue;
      job.claimed = true;
      response.json({ id, payload: job.payload });
      return;
    }
    response.status(204).end();
  });
  router.post('/job/:id', json({ limit: '512kb' }), (request, response) => {
    const parsed = result.parse(request.body);
    const job = jobs.get(z.uuid().parse(request.params.id));
    if (job?.claimed) {
      if ('failed' in parsed) job.reject(new HttpError(502, 'Ollama trên máy không xử lý được yêu cầu.', 'OLLAMA_WORKER_FAILED'));
      else job.resolve(parsed.data);
    }
    response.status(204).end();
  });
  return router;
}
