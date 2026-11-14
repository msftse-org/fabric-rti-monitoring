import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const telemetry = fileURLToPath(new URL('../../../telemetry/client/index.ts', import.meta.url));
const oncall = fileURLToPath(new URL('../../../oncall/src/index.ts', import.meta.url));

// Relative base: the Fabric-hosted path is not known at build time.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@telemetry': telemetry, '@oncall': oncall }, dedupe: ['react', 'react-dom'] },
  server: { port: 5181, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
