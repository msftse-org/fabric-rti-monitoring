import { Flame } from 'lucide-react';
import { workloadColor } from '../lib/palette';
import { href } from '../lib/router';

export function IssuePill({ count, severity }: { count: number; severity?: string }) {
  if (count === 0) return <span className="muted">–</span>;
  return (
    <span className={`issue-pill${severity === 'S1' ? '' : ' issue-pill--warn'}`}>
      <Flame size={12} aria-hidden="true" />
      {count}
    </span>
  );
}

export function WorkloadName({ name, color = workloadColor(name) }: { name: string; color?: string }) {
  return (
    <a className="wl-name" href={href(`workloads/${name}`)} onClick={(event) => event.stopPropagation()}>
      <i style={{ background: color }} aria-hidden="true" />
      {name}
    </a>
  );
}
