import { Database } from 'lucide-react';
import { serviceColor } from '../lib/palette';

export function ServiceGlyph({ name, database = false }: { name: string; database?: boolean }) {
  return (
    <span className="svc-glyph" style={{ borderColor: serviceColor(name), color: serviceColor(name) }} aria-hidden>
      {database ? <Database size={10} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}
