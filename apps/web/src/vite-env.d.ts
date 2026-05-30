/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API 오리진/프리픽스. 미설정 시 dev 프록시(단일 오리진)를 쓴다.
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
