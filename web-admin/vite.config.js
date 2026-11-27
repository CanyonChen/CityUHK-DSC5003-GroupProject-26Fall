import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      allow: ['.', '../pages/brand.css', '../pages/media/stage-curtain.webp'],
    },
    host: '127.0.0.1',
    port: 8081,
    strictPort: true,
  },
});
