import type { Kysely } from 'kysely';
import type { Database } from '../types.js';
import { down as removePreference, up as restorePreference } from './017_assistant_local.js';

export const up = (db: Kysely<Database>) => removePreference(db);
export const down = (db: Kysely<Database>) => restorePreference(db);
