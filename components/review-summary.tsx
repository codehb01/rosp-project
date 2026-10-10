type Props = {
  summary?: { summary: string; tags: string[] } | null;
  /** Single truncated line, no tags. For tight list rows. */
  compact?: boolean;
};

/** "Customers say: ..." line with tags. Renders nothing when there is no summary. */
export function ReviewSummary({ summary, compact }: Props) {
  if (!summary?.summary) return null;

  return (
    <div className="min-w-0">
      <p className={`text-xs text-muted-foreground ${compact ? "truncate" : ""}`}>
        <span className="font-medium text-foreground">Customers say:</span> {summary.summary}
      </p>
      {!compact && summary.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {summary.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
