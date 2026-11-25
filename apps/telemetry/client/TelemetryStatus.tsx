import type { TelemetryState } from './useTelemetry';
import './telemetry-status.css';

/** Shared only by the four mock shells; independent of each mock's local on-call clock. */
export function TelemetryStatus({ telemetry, paused = false }: { telemetry: TelemetryState; paused?: boolean }) {
  const { bundle, mode, error, loading, lastSuccessAt, liveConfigured, needsConnect, connecting, connect } = telemetry;
  const instant = bundle?.generatedAt;
  const label = mode === 'live' ? (error ? 'Live · refresh failed' : 'Live') : mode === 'snapshot' ? 'Snapshot' : 'Telemetry';
  const date = instant ? new Date(instant) : null;
  const fullTime = date?.toLocaleString(undefined, { timeZone: 'UTC', timeZoneName: 'short' });
  const clock = date?.toLocaleTimeString(undefined, { timeZone: 'UTC', hour12: false });
  const connectVisible = liveConfigured && (needsConnect || mode !== 'live');
  return (
    <div className="telemetry-status" aria-label="Telemetry freshness">
      <span className="telemetry-status__summary" role="status" title={`${fullTime ? `Bundle generated ${fullTime}. ` : ''}${lastSuccessAt ? `Last successful live refresh ${lastSuccessAt}. ` : ''}${error ?? ''}`}>
        {paused ? 'Paused · ' : ''}{label}{clock ? <> · <time dateTime={instant}>{date?.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })} {clock} UTC</time></> : loading ? ' · loading…' : ''}
        {loading && bundle && <span className="telemetry-status__refreshing"> · refreshing…</span>}
      </span>
      {connectVisible && (
        <button type="button" className="telemetry-status__connect" disabled={connecting} onClick={() => void connect()}>
          {connecting ? 'Connecting…' : 'Connect live data'}
        </button>
      )}
      {error && !needsConnect && <span className="telemetry-status__error">{error}</span>}
      {needsConnect && !connecting && <span className="telemetry-status__hint">{error ?? 'Sign in for automatic updates.'}</span>}
    </div>
  );
}
