import { Info, X } from 'lucide-react';
import { useShell } from '../../lib/app';
import { useDismissible } from '../../lib/prefs';
import { TelemetryStatus } from '@telemetry';

export const DISCLAIMER = 'Unofficial demo mock built on Microsoft Fabric Real-Time Intelligence — not affiliated with Datadog, Inc. Data: synthetic OpenTelemetry from AKS.';

export function DisclaimerBanner() {
  const [dismissed, dismiss] = useDismissible('ddmock.banner');
  if (dismissed) return null;
  return (
    <div className="banner" role="note">
      <Info size={14} />
      <span className="grow">{DISCLAIMER}</span>
      <button type="button" className="icon-btn" aria-label="Dismiss disclaimer" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

export function FooterStrip() {
  const { source, time } = useShell();
  return (
    <footer className="footer">
      <span className="footer__text truncate">Datadog Mock · {DISCLAIMER}</span>
      <TelemetryStatus telemetry={source} paused={time.paused} />
    </footer>
  );
}
