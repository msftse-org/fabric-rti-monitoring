export interface LegendItem {
  label: string;
  color: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label}>
          <i style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
