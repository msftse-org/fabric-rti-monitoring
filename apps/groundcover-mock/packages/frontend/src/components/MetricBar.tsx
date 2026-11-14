export function MetricBar({ text, value, max, color, title }: { text: string; value: number; max: number; color: string; title?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="mbar" title={title}>
      <span className="mbar__text">{text}</span>
      <span className="mbar__track" aria-hidden="true"><i style={{ width: `${pct}%`, background: color }} /></span>
    </div>
  );
}
