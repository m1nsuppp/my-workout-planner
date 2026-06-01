import { useState } from 'react';
import { useRoutineService } from '../app/contexts/routine-service-context';
import type { ChatMessage, Routine, RoutineDraft } from './repository';

// 루틴 생성 대화 화면의 상태 기계 — service.chat()/create()를 감싼다.
// UI는 messages를 렌더하고 send/confirm을 호출할 뿐, LLM·HTTP는 모른다. fake service로 단위 검증된다.
export type RoutineChatStatus = 'idle' | 'sending' | 'creating' | 'error';

export interface RoutineChat {
  messages: readonly ChatMessage[];
  // 확정 가능한 최신 루틴 제안(proposing). null이면 아직 확정할 게 없음 → 확정 버튼 숨김.
  proposal: RoutineDraft | null;
  status: RoutineChatStatus;
  send: (text: string) => void;
  confirm: () => Promise<Routine>;
}

export function useRoutineChat(): RoutineChat {
  const service = useRoutineService();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<RoutineDraft | null>(null);
  const [status, setStatus] = useState<RoutineChatStatus>('idle');

  const send = (text: string): void => {
    const userMessage: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setProposal(null); // 새 발화로 직전 제안은 무효화 — 모델 응답으로 다시 채운다.
    setStatus('sending');

    void service.chat(history).then(
      (next) => {
        const assistantMessage: ChatMessage = { role: 'assistant', content: next.message };
        setMessages((prev) => [...prev, assistantMessage]);
        setProposal(next.phase === 'proposing' ? next.routine : null);
        setStatus('idle');
      },
      () => {
        setStatus('error');
      },
    );
  };

  const confirm = async (): Promise<Routine> => {
    if (proposal === null) {
      throw new Error('확정할 루틴 제안이 없습니다.');
    }

    setStatus('creating');
    try {
      const routine = await service.create(proposal);
      setStatus('idle');

      return routine;
    } catch (e) {
      setStatus('error');
      throw e;
    }
  };

  return { messages, proposal, status, send, confirm };
}
