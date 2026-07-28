import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发时后端地址（生产模式由 server 直接托管 dist，同源无需代理）
const DEV_SERVER = process.env.DEV_SERVER_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    proxy: {
      '/health': DEV_SERVER,
      '/ws': { target: DEV_SERVER, ws: true },
    },
  },
});
