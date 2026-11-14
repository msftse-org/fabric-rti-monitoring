import { Info, X } from 'lucide-react';
import { useShell } from '../../lib/app';
import { useDismissible } from '../../lib/prefs';
import { formatClock } from '@telemetry';

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
  const { source } = useShell();
  const live = source.mode === 'live';
  return (
    <footer className="footer">
      <span className="footer__text truncate">Datadog Mock · {DISCLAIMER}</span>
      <span className="footer__source" data-live={live} title={source.fellBack ? 'Live API unavailable; showing the bundled snapshot' : undefined}>
        <span className="footer__dot" aria-hidden="true" />
        {live ? 'Live' : source.generatedAt ? `Snapshot · generated ${formatClock(source.generatedAt, false)} UTC` : 'Loading…'}
      </span>
    </footer>
  );
}
