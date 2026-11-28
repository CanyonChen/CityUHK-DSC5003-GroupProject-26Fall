import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // Development/preview proxy mirrors the documented production /api reverse proxy.
  preview: { port: 8081, strictPort: true, host: '127.0.0.1', proxy: apiProxy() },
  server: {
    proxy: apiProxy(),
    fs: {
      allow: ['.', '../shared', '../pages/brand.css', '../pages/media/stage-curtain.webp'],
    },
    host: '127.0.0.1',
    port: 8081,
    strictPort: true,
  },
});

function apiProxy() {
  return { '/api': {
    target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
    changeOrigin: true, ws: true, rewrite: path => path.replace(/^\/api(?=\/|$)/, ''),
  } };
}
