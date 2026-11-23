import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().url().default('postgresql://lifeos:lifeos@127.0.0.1:5432/lifeos'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-5-mini'),
  OLLAMA_BASE_URL: z.url().refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      && (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'));
  }).optional(),
  OLLAMA_WORKER_TOKEN: z.string().min(32).max(256).regex(/^[\x21-\x7e]+$/).optional(),
  OLLAMA_ACCESS_CODE: z.string().min(16).max(256).regex(/^[\x21-\x7e]+$/).optional(),
  ASSISTANT_SETTINGS_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().min(32).optional()),
});

export const config = envSchema.parse(process.env);
export const localOllama = config.OLLAMA_BASE_URL !== undefined && new URL(config.OLLAMA_BASE_URL).hostname === '127.0.0.1';
