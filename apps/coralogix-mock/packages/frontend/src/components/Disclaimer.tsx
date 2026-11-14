import { X } from 'lucide-react';
import { useState } from 'react';
import { DISCLAIMER } from '../lib/disclaimer';

const STORAGE_KEY = 'coralogix-mock.disclaimer-dismissed';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function DisclaimerBanner() {
  const [visible, setVisible] = useState(() => !wasDismissed());
  if (!visible) return null;
  return (
    <div className="banner" role="note">
      <span>{DISCLAIMER}</span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Dismiss disclaimer"
        onClick={() => {
          setVisible(false);
          try {
            window.localStorage.setItem(STORAGE_KEY, '1');
          } catch {
            // Storage can be unavailable in embedded browsers; the banner simply returns next visit.
          }
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function FooterStrip() {
  return <footer className="footer-strip">{DISCLAIMER}</footer>;
}
