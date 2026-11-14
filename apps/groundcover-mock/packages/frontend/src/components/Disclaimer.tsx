import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { usePersistedFlag } from '../lib/hooks';

export const DISCLAIMER =
  'Unofficial demo mock built on Microsoft Fabric Real-Time Intelligence — not affiliated with groundcover Inc. Data: synthetic OpenTelemetry from AKS.';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = usePersistedFlag('gc-mock-banner-dismissed', false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (dismissed || !mounted) return null;
  return (
    <div className="banner" role="note">
      <Info size={14} aria-hidden="true" />
      <span>{DISCLAIMER}</span>
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss disclaimer" onClick={() => setDismissed(true)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function DisclaimerFooter() {
  return <footer className="disclaimer">{DISCLAIMER}</footer>;
}
