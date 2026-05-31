import type { CurrentUser } from './repository';

// 인증 use-case 경계 — react는 이 인터페이스만 의존한다(repository는 보지 않는다).
// 로그인 시작·로그아웃은 OAuth 리다이렉트/쿠키 정리를 위한 *브라우저 내비게이션*이라
// 여기 두지 않는다(UI에서 <a>/<form>으로 직접 수행). 여기선 "현재 누구인가"만 책임진다.
export interface AuthService {
  me: () => Promise<CurrentUser | null>;
}
