import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const API_ORIGIN = 'http://localhost:8787';

// dev에서는 /auth·/api 요청을 wrangler dev(:8787)로 프록시해 단일 오리진처럼 동작시킨다.
// (프로덕션은 app.x.com / api.x.com 서브도메인 분리 — same-site라 sid 쿠키는 그대로 실린다.)
// OAuth 콜백을 프록시로 받으려면 api의 OAUTH_REDIRECT_URI를 :5173/auth/google/callback로
// 맞춰야 sid 쿠키가 5173 오리진에 박힌다 — web↔api 연동 단계에서 처리.
export default defineConfig({
  plugins: [
    // tanstackRouter는 반드시 react()보다 먼저 와야 한다.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      // react 코드는 src/app 아래로 모은다 — 라우트·생성물도 그 안에 둔다.
      routesDirectory: 'src/app/routes',
      generatedRouteTree: 'src/app/route-tree.gen.ts',
      // 라우트와 코로케이션한 테스트(*.spec.tsx)는 라우트가 아니므로 route-tree 스캔에서 제외한다.
      routeFileIgnorePattern: '\\.spec\\.',
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      // 리소스 API는 /api 아래로 모은다(SPA 클라이언트 라우트와 경로 충돌 방지). OAuth는 /auth.
      '/auth': { target: API_ORIGIN, changeOrigin: true },
      '/api': { target: API_ORIGIN, changeOrigin: true },
    },
  },
});
