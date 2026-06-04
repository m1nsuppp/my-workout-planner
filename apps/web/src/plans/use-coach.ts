import { useState } from 'react';
import { usePlanService } from '../app/contexts/plan-service-context';
import type { ChatMessage, CoachChange, Plan } from './repository';

// 운동 중 코치(S8) 대화 상태 기계 — service.coach()/applyCoach()를 감싼다.
// 묻기는 SSE 토큰을 streaming에 누적해 표시하고, applying 변경안은 멱등성 키와 함께 적용한다.
// advisory(rest/end_session)는 화면이 처리하므로 hook은 applying 변경안의 적용만 책임진다.
export type CoachStatus = 'idle' | 'sending' | 'chatError' | 'applying' | 'applyError';

export interface Coach {
  messages: readonly ChatMessage[];
  streaming: string;
  // 코치가 제시한 최신 변경안(applying·advisory 모두). null이면 제시된 변경 없음.
  change: CoachChange | null;
  status: CoachStatus;
  send: (text: string) => void;
  // applying(substitute/adjust_load) 변경안을 적용하고 변형된 Plan을 돌려준다. 그 외엔 throw.
  apply: () => Promise<Plan>;
}

export function useCoach(planId: string): Coach {
  const service = usePlanService();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [status, setStatus] = useState<CoachStatus>('idle');
  // 변경안과 멱등성 키를 함께 보관 — 같은 변경안의 적용 재시도는 같은 키라 중복 적용되지 않는다.
  const [pending, setPending] = useState<{ change: CoachChange; key: string } | null>(null);

  const send = (text: string): void => {
    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages(history);
    setPending(null);
    setStreaming('');
    setStatus('sending');

    void service.coach(planId, history, (token) => setStreaming((prev) => prev + token)).then(
      (response) => {
        setMessages((prev) => [...prev, { role: 'assistant', content: response.message }]);
        setStreaming('');
        setPending(response.change === null ? null : { change: response.change, key: crypto.randomUUID() });
        setStatus('idle');
      },
      () => {
        setStreaming('');
        setStatus('chatError');
      },
    );
  };

  const apply = async (): Promise<Plan> => {
    if (pending === null) {
      throw new Error('적용할 변경안이 없습니다.');
    }
    const { change, key } = pending;
    if (change.kind !== 'substitute' && change.kind !== 'adjust_load') {
      throw new Error('적용 가능한 변경안이 아닙니다(advisory).');
    }

    setStatus('applying');
    try {
      const plan = await service.applyCoach(planId, change, key);
      setStatus('idle');

      return plan;
    } catch (e) {
      setStatus('applyError');
      throw e;
    }
  };

  return { messages, streaming, change: pending?.change ?? null, status, send, apply };
}
