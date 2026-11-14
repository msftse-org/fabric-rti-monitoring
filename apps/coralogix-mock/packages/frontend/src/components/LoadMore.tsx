interface LoadMoreProps {
  shown: number;
  total: number;
  onMore: () => void;
  noun?: string;
}

export function LoadMore({ shown, total, onMore, noun = 'rows' }: LoadMoreProps) {
  return (
    <div className="load-more">
      <span>
        Showing {shown} of {total} {noun}
      </span>
      {shown < total && (
        <button type="button" className="btn" onClick={onMore}>
          Load more
        </button>
      )}
    </div>
  );
}
