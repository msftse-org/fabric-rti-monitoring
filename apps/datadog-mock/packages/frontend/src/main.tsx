import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/charts.css';
import './styles/logs.css';
import './styles/apm.css';
import './styles/traces.css';
import './styles/metrics.css';
import './styles/dashboards.css';
import './styles/oncall.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
