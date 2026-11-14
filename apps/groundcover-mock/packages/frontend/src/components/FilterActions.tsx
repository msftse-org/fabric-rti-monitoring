import { Code2 } from 'lucide-react';
import { useToast } from '../lib/toast';

/** Inert shortcuts that sit next to the filter bar in the real product. */
export function FilterActions() {
  const toast = useToast();
  return (
    <>
      <button type="button" className="icon-btn icon-btn--boxed" aria-label="Edit query as text" onClick={() => toast()}>
        <Code2 size={15} aria-hidden="true" />
      </button>
      <button type="button" className="btn" onClick={() => toast()}>Open in Data Explorer</button>
      <button type="button" className="btn btn--primary" onClick={() => toast()}>Create Monitor</button>
    </>
  );
}
