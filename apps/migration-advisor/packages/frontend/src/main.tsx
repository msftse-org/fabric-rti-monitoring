import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './styles.css';
import './conventions.css';
import { App } from './App';
import { startBrowserTelemetry } from './browserTelemetry';

const connectionString = import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING as string | undefined;
const telemetryConfigured = !!connectionString?.trim();
if (telemetryConfigured) void startBrowserTelemetry({ connectionString });
createRoot(document.getElementById('root')!).render(<React.StrictMode><App telemetryConfigured={telemetryConfigured} /></React.StrictMode>);
