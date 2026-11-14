import { Cloud, RefreshCw } from 'lucide-react';
import { useOnCall } from '../lib/oncall';
import { Button } from './ui';

export function LiveAlertsConnection() {
  const { liveAlerts } = useOnCall();
  return (
    <section className="callout live-alerts" aria-label="Fabric alert connection" aria-busy={liveAlerts.loading}>
      <Cloud size={18} aria-hidden />
      <div className="live-alerts__body">
        <strong>{liveAlerts.connected ? 'Connected to Fabric' : 'Live alerts in Fabric'}</strong>
        <p className="small">
          {!liveAlerts.configured ? 'Deploy this app with Rayfin to configure its authenticated alert backend.' :
            liveAlerts.connected ? `Signed in as ${liveAlerts.email}. Alerts and their actions run in Activator even when this page is closed.` :
              'Sign in to create, edit, start and stop real Activator alerts. Existing demo rules are separate.'}
        </p>
        {liveAlerts.error && <p className="field__error" role="alert">{liveAlerts.error}</p>}
      </div>
      <Button disabled={!liveAlerts.configured || liveAlerts.loading} onClick={() => void (liveAlerts.connected ? liveAlerts.refresh() : liveAlerts.connect())} icon={<RefreshCw size={14} aria-hidden />}>
        {liveAlerts.loading ? 'Connecting / loading...' : liveAlerts.connected ? 'Refresh Fabric rules' : 'Sign in to Fabric'}
      </Button>
    </section>
  );
}
