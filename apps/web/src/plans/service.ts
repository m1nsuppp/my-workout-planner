import type { NextDay, Plan, PlanChatInput, PlanDraft, PlanProposal } from './repository';

// 계획 use-case 경계 — react는 이 인터페이스만 의존한다(repository는 보지 않는다).
export interface PlanService {
  get: (id: string) => Promise<Plan>;
  create: (draft: PlanDraft) => Promise<Plan>;
  nextDay: (routineId: string) => Promise<NextDay>;
  chat: (input: PlanChatInput) => Promise<PlanProposal>;
}
