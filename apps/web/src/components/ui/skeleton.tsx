import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton block", className)} />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading table" className="w-full">
      <div className="flex gap-4 border-b border-[var(--color-rule-2)] px-3.5 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-b border-[var(--color-rule)] px-3.5 py-4 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton
              key={column}
              className={cn("h-3.5 flex-1", column === 0 ? "max-w-[180px]" : "max-w-[130px]")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading content" className="flex flex-col gap-3">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn("h-4", index === 0 ? "w-1/3" : "w-full")} />
      ))}
    </div>
  );
}
