// 세션 저장소 포트. sid(id)로 식별하고, 만료 판단은 호출자가 넘기는 now 기준이다(시계 주입).

export interface NewSession {
  userId: string;
  expiresAt: string; // ISO
}

export interface SessionRecord extends NewSession {
  id: string; // sid
  createdAt: string;
}

export interface SessionRepository {
  create: (session: NewSession) => Promise<SessionRecord>;
  // now 시점에 유효한(만료 전) 세션만 반환. 없거나 만료면 null.
  findValid: (id: string, now: string) => Promise<SessionRecord | null>;
  delete: (id: string) => Promise<void>;
}
