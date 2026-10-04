import { Inbox } from "lucide-react";

interface EmptyStateProps {
  code?: string;
  title?: string;
  message: string;
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="p-12 flex justify-center items-center" role="status">
      <div className="border border-outline-variant/70 bg-surface p-8 text-center max-w-md w-full rounded-sm">
        <div className="w-10 h-10 mx-auto mb-3 border border-outline-variant/70 bg-surface-container-low/50 flex items-center justify-center text-secondary rounded-sm">
          <Inbox className="w-5 h-5" />
        </div>
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-on-surface mb-1.5">
          {title ?? "No Data Available"}
        </h3>
        <p className="font-mono text-xs text-secondary leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}
