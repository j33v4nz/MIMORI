import type { ReactNode } from "react";

interface DataTableProps {
  caption?: string;
  headers: Array<{ label: string; className?: string }>;
  children: ReactNode;
}

export function DataTable({ caption, headers, children }: DataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        {caption && (
          <caption className="sr-only">{caption}</caption>
        )}
        <thead>
          <tr className="bg-surface-dim border-b-[0.5px] border-outline-variant font-mono text-xs">
            {headers.map((header) => (
              <th
                key={header.label}
                scope="col"
                className={`p-4 text-on-surface-variant uppercase ${header.className ?? ""}`}
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-sm text-primary">
          {children}
        </tbody>
      </table>
    </div>
  );
}
