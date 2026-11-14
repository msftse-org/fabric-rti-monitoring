import react from '@vitejs/plugin-react-swc';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const telemetry = fileURLToPath(new URL('../../../telemetry/client/index.ts', import.meta.url));
const oncall = fileURLToPath(new URL('../../../oncall/src/index.ts', import.meta.url));

/** Prefills the Activator export with this deployment's workspace and KQL database ids; they are not secrets. */
function fabricTarget(): { workspaceId: string; databaseItemId: string } | null {
  try {
    const local = JSON.parse(readFileSync(new URL('../../../../output/fabric.local.json', import.meta.url), 'utf8'));
    return typeof local.workspaceId === 'string' && typeof local.databaseItemId === 'string' ? { workspaceId: local.workspaceId, databaseItemId: local.databaseItemId } : null;
  } catch {
    return null;
  }
}

// Relative base: the Fabric-hosted path is not known at build time.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __FABRIC_TARGET__: JSON.stringify(fabricTarget()) },
  resolve: { alias: { '@telemetry': telemetry, '@oncall': oncall }, dedupe: ['react', 'react-dom'] },
  server: { port: 5184, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
