import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('courses').addColumn('absences', 'integer').execute();
  await db.schema.alterTable('courses').addCheckConstraint('course_absences_nonnegative', sql`absences >= 0`).execute();

  const now = new Date();
  const sessions = await db.selectFrom('project_timer_sessions').select(['id', 'started_at'])
    .where('course_id', 'is not', null).where('assignment_id', 'is', null).where('stopped_at', 'is', null).execute();
  for (const session of sessions) {
    await db.updateTable('project_timer_sessions').set({ stopped_at: now.toISOString(),
      duration_seconds: Math.max(0, Math.floor((now.getTime() - Date.parse(session.started_at)) / 1000)) })
      .where('id', '=', session.id).execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('courses').dropConstraint('course_absences_nonnegative').execute();
  await db.schema.alterTable('courses').dropColumn('absences').execute();
}
