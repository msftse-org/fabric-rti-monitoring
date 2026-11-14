import { BookMarked } from 'lucide-react';
import { DropdownMenu } from './DropdownMenu';

export interface SavedView {
  id: string;
  label: string;
  query: string;
}

export function SavedViewsMenu({ views, active, onPick }: { views: SavedView[]; active: string; onPick: (query: string) => void }) {
  return (
    <DropdownMenu
      ariaLabel="Saved Views"
      triggerClassName="pill-btn"
      trigger={
        <>
          <BookMarked size={13} aria-hidden /> Saved Views
        </>
      }
      items={views.map((view) => ({
        id: view.id,
        label: view.label,
        hint: view.query,
        selected: view.query === active,
        onSelect: () => onPick(view.query),
      }))}
    />
  );
}
