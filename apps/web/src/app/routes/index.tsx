import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home(): JSX.Element {
  return (
    <main>
      <h1>my-workout-planner</h1>
      <p>스캐폴드 완료. 인증·화면은 후속 작업에서 연결한다.</p>
    </main>
  );
}
