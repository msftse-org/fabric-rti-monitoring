import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5185, strictPort: true },
  preview: { port: 5185, strictPort: true },
  build: { outDir: 'dist' },
});
