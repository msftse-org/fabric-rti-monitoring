import { Compass } from 'lucide-react';
import { EmptyState, LinkButton } from '../components/ui';
import { href, paths } from '../lib/router';

export function NotFound({ path }: { path: string }) {
  return (
    <EmptyState icon={Compass} title="This view does not exist">
      <p>
        Nothing is routed at <code className="inline-code">{path}</code>. Use the navigation above, or go back to the overview.
      </p>
      <LinkButton href={href(paths.overview())} variant="primary">
        Go to the overview
      </LinkButton>
    </EmptyState>
  );
}
