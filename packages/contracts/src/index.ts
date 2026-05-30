// 공개 표면은 엔드포인트 계약(DTO) + 에러 봉투의 "모양"(파싱·분기용).
// 실패 봉투를 *만드는* 빌더는 서버만 쓰므로 contracts에 두지 않는다(apps/api 소관).
// 구성 블록(Routine/Plan 등)·값 타입은 내부 부품으로 숨기고, BE/FE는 경계에서 자기 도메인으로 매핑한다.
export * from './dto';
export {
  ApiFailureSchema,
  type ApiError,
  type ApiFailure,
  type ApiResponse,
  type ApiSuccess,
} from './envelope';
