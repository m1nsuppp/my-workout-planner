// 사용자 저장소 포트. 사용하는 쪽(인증 서비스) 관점에서 설계한다.
// OAuth 신원을 (provider, providerUserId)로 식별해 upsert한다.

export interface NewUser {
  provider: string;
  providerUserId: string;
  email: string;
}

export interface UserRecord extends NewUser {
  id: string;
  createdAt: string;
}

export interface UserRepository {
  // 같은 (provider, providerUserId)면 기존 user를 반환한다(중복 생성 없음).
  upsertByProvider: (user: NewUser) => Promise<UserRecord>;
  findById: (id: string) => Promise<UserRecord | null>;
}
