import type {
  ApplyableChange,
  ChatMessage,
  CoachResponse,
  NextDay,
  Plan,
  PlanChatInput,
  PlanDateRange,
  PlanDraft,
  PlannedSet,
  PlanProposal,
  PlanStatusUpdate,
  PlanSummary,
  SetRecordInput,
} from './repository';

// 계획 use-case 경계 — react는 이 인터페이스만 의존한다(repository는 보지 않는다).
export interface PlanService {
  get: (id: string) => Promise<Plan>;
  list: (range?: PlanDateRange) => Promise<PlanSummary[]>;
  create: (draft: PlanDraft) => Promise<Plan>;
  nextDay: (routineId: string) => Promise<NextDay>;
  chat: (input: PlanChatInput, onDelta?: (text: string) => void) => Promise<PlanProposal>;
  updateStatus: (planId: string, status: PlanStatusUpdate) => Promise<Plan>;
  updateSet: (setId: string, record: SetRecordInput) => Promise<PlannedSet>;
  coach: (
    planId: string,
    history: ChatMessage[],
    onDelta?: (text: string) => void,
  ) => Promise<CoachResponse>;
  applyCoach: (planId: string, change: ApplyableChange, idempotencyKey: string) => Promise<Plan>;
}
