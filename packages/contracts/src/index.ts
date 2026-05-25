// 공개 표면은 엔드포인트 계약(DTO)뿐.
// 구성 블록(Routine/Plan 등)·값 타입은 내부 부품으로 숨기고, BE/FE는 경계에서 자기 도메인으로 매핑한다.
export * from './dto';
