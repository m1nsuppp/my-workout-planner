import { useState } from 'react';
import { usePlanService } from '../app/contexts/plan-service-context';
import type { ChatMessage, Plan, PlanDraft } from './repository';

// 계획 생성 대화 화면의 상태 기계(하이브리드 카드) — service.chat()/create()를 감싼다.
// 진입 시 서버 시드 초안(initialDraft)으로 카드를 채우고, 이후 카드는 항상 채워진 상태로 유지된다.
// 사용자는 카드를 직접 편집(editSet)하거나 대화(send)로 갱신한다. 매 대화 응답은 카드 전체를 대체한다.
// 실패는 단계별로 구분(chatError=응답 실패 / createError=저장 실패) — UI가 다른 안내를 주도록.
export type PlanChatStatus = 'idle' | 'sending' | 'creating' | 'chatError' | 'createError';

export interface PlanChatContext {
  routineId: string;
  routineDayLabel: string;
  date: string;
}

// 세트 한 칸 편집(무게/횟수). 둘 중 준 값만 갱신한다.
export interface SetPatch {
  targetWeightKg?: number;
  targetReps?: number;
}

export interface PlanChat {
  // 편집 가능한 현재 카드. 확정·대화 입력에 그대로 쓰인다.
  draft: PlanDraft;
  messages: readonly ChatMessage[];
  // 도착 중인 assistant 메시지(SSE 토큰 누적). 빈 문자열이면 표시하지 않는다.
  streaming: string;
  status: PlanChatStatus;
  // 자유 대화 한 턴 — 현재 카드를 함께 싣고, 응답으로 카드를 갱신한다.
  send: (text: string) => void;
  // 카드의 세트 한 칸 직접 편집.
  editSet: (exerciseIndex: number, setIndex: number, patch: SetPatch) => void;
  confirm: () => Promise<Plan>;
}

export function usePlanChat(context: PlanChatContext, initialDraft: PlanDraft): PlanChat {
  const service = usePlanService();
  const [draft, setDraft] = useState<PlanDraft>(initialDraft);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [status, setStatus] = useState<PlanChatStatus>('idle');

  const send = (text: string): void => {
    const userMessage: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setStreaming('');
    setStatus('sending');

    void service
      .chat({ ...context, draft, history }, (token) => setStreaming((prev) => prev + token))
      .then(
        (next) => {
          setMessages((prev) => [...prev, { role: 'assistant', content: next.message }]);
          setStreaming(''); // 확정 메시지로 대체됐으니 스트리밍 버블은 비운다.
          setDraft(next.planDraft); // 응답이 카드 전체를 대체한다(grounding된 종목 유지).
          setStatus('idle');
        },
        () => {
          setStreaming('');
          setStatus('chatError');
        },
      );
  };

  const editSet = (exerciseIndex: number, setIndex: number, patch: SetPatch): void => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i !== exerciseIndex
          ? ex
          : { ...ex, sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) },
      ),
    }));
  };

  const confirm = async (): Promise<Plan> => {
    setStatus('creating');
    try {
      const plan = await service.create(draft);
      setStatus('idle');

      return plan;
    } catch (e) {
      setStatus('createError');
      throw e;
    }
  };

  return { draft, messages, streaming, status, send, editSet, confirm };
}
