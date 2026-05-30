import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
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
      generatedRouteTree: 'src/route-tree.gen.ts',
    }),
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: API_ORIGIN, changeOrigin: true },
      '/api': { target: API_ORIGIN, changeOrigin: true },
    },
  },
});
