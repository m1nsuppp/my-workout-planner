import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { users } from '../db/schema';
import type { UserRecord, UserRepository } from './user-repository';

const newId = (): string => crypto.randomUUID();

export function createD1UserRepository(d1: D1Database): UserRepository {
  const db = drizzle(d1);

  return {
    upsertByProvider: async (user) => {
      const existing = await findByProvider(db, user.provider, user.providerUserId);
      if (existing !== null) {
        return existing;
      }

      const record: UserRecord = {
        id: newId(),
        provider: user.provider,
        providerUserId: user.providerUserId,
        email: user.email,
        createdAt: new Date().toISOString(),
      };
      await db.insert(users).values(record);

      return record;
    },
    findById: async (id) => {
      const row = await db.select().from(users).where(eq(users.id, id)).get();

      return row ?? null;
    },
  };
}

async function findByProvider(
  db: ReturnType<typeof drizzle>,
  provider: string,
  providerUserId: string,
): Promise<UserRecord | null> {
  const row = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.providerUserId, providerUserId)))
    .get();

  return row ?? null;
}
