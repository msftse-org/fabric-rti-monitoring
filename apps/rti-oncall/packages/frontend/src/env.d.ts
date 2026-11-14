/** Read from output/fabric.local.json at build time; null when the deployment has not been bootstrapped. */
declare const __FABRIC_TARGET__: { workspaceId: string; databaseItemId: string } | null;
/// <reference types="vite/client" />
