import type { MeResponseDto } from '@workout/contracts';

// 경계 도메인 타입 — 지금은 contracts와 1:1이라 DTO에서 추출해 그대로 쓴다.
export type CurrentUser = Extract<MeResponseDto, { ok: true }>['data'];

// 인증 도메인의 사용처 관점 인터페이스. HTTP·쿠키(sid)를 노출하지 않는다.
// 미로그인은 *상태*지 실패가 아니다 — me는 null을 돌려준다(throw하지 않음).
// 그 외 응답 오류(서버 장애 등)는 ApiResponseError로 던진다.
export interface AuthRepository {
  me: () => Promise<CurrentUser | null>;
}
