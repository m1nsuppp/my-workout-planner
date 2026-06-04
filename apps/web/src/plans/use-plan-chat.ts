import { useState } from 'react';
import { usePlanService } from '../app/contexts/plan-service-context';
import type { ChatMessage, Plan, PlanDraft } from './repository';

// 계획 생성 대화 화면의 상태 기계 — service.chat()/create()를 감싼다.
// 대상 Day·날짜 컨텍스트는 진입 시 확정돼 hook 인자로 주입된다(send마다 함께 싣는다).
// 실패는 단계별로 구분(chatError=응답 실패 / createError=저장 실패) — UI가 다른 안내를 주도록.
export type PlanChatStatus = 'idle' | 'sending' | 'creating' | 'chatError' | 'createError';

export interface PlanChatContext {
  routineId: string;
  routineDayLabel: string;
  date: string;
}

export interface PlanChat {
  messages: readonly ChatMessage[];
  // 확정 가능한 최신 계획 제안(proposing). null이면 아직 확정할 게 없음 → 확정 버튼 숨김.
  proposal: PlanDraft | null;
  status: PlanChatStatus;
  send: (text: string) => void;
  confirm: () => Promise<Plan>;
}

export function usePlanChat(context: PlanChatContext): PlanChat {
  const service = usePlanService();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<PlanDraft | null>(null);
  const [status, setStatus] = useState<PlanChatStatus>('idle');

  const send = (text: string): void => {
    const userMessage: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setProposal(null); // 새 발화로 직전 제안은 무효화 — 모델 응답으로 다시 채운다.
    setStatus('sending');

    void service.chat({ ...context, history }).then(
      (next) => {
        const assistantMessage: ChatMessage = { role: 'assistant', content: next.message };
        setMessages((prev) => [...prev, assistantMessage]);
        setProposal(next.phase === 'proposing' ? next.planDraft : null);
        setStatus('idle');
      },
      () => {
        setStatus('chatError');
      },
    );
  };

  const confirm = async (): Promise<Plan> => {
    if (proposal === null) {
      throw new Error('확정할 계획 제안이 없습니다.');
    }

    setStatus('creating');
    try {
      const plan = await service.create(proposal);
      setStatus('idle');

      return plan;
    } catch (e) {
      setStatus('createError');
      throw e;
    }
  };

  return { messages, proposal, status, send, confirm };
}
