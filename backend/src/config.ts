import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().url().default('postgresql://lifeos:lifeos@127.0.0.1:5432/lifeos'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export const config = envSchema.parse(process.env);
