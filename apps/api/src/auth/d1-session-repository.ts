import { eq, gt, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sessions } from '../db/schema';
import type { SessionRecord, SessionRepository } from './session-repository';

const newId = (): string => crypto.randomUUID();

export function createD1SessionRepository(d1: D1Database): SessionRepository {
  const db = drizzle(d1);

  return {
    create: async (session) => {
      const record: SessionRecord = {
        id: newId(),
        userId: session.userId,
        expiresAt: session.expiresAt,
        createdAt: new Date().toISOString(),
      };
      await db.insert(sessions).values(record);

      return record;
    },
    findValid: async (id, now) => {
      const row = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
        .get();

      return row ?? null;
    },
    delete: async (id) => {
      await db.delete(sessions).where(eq(sessions.id, id));
    },
  };
}
