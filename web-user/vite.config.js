import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      allow: ['.', '../pages/brand.css', '../pages/media/stage-curtain.webp'],
    },
    port: 8080,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 8080,
    strictPort: true,
    host: '127.0.0.1',
  },
});
