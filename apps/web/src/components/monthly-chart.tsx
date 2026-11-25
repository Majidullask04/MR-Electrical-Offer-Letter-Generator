import { EmptyState } from "@/components/ui/states";
import { formatNumber } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/types";

const series = [
  { key: "created" as const, label: "Created", color: "bg-[var(--color-accent)]" },
  { key: "issued" as const, label: "Issued", color: "bg-[var(--color-cool)]" },
  { key: "accepted" as const, label: "Accepted", color: "bg-[var(--color-ok)]" },
];

export function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  const max = Math.max(
    1,
    ...data.flatMap((point) => [point.created, point.issued, point.accepted]),
  );
  const hasActivity = data.some(
    (point) => point.created + point.issued + point.accepted > 0,
  );

  if (!hasActivity) {
    return (
      <EmptyState
        title="No offer activity in this window"
        description="Monthly counts appear once an offer is created. Adjust the date range or start a new offer."
      />
    );
  }

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-xs text-[var(--color-muted)]">
          Counts by month, current year window
        </figcaption>
        <ul className="flex flex-wrap items-center gap-3">
          {series.map((item) => (
            <li key={item.key} className="inline-flex items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
              <span aria-hidden="true" className={`h-2 w-2 rounded-[1px] ${item.color}`} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="scroll-x">
        <div className="flex min-w-[560px] gap-2">
          <div className="flex h-[172px] w-7 shrink-0 flex-col justify-between pb-6 text-right">
            <span className="mono text-[9px] text-[var(--color-faint)]">{max}</span>
            <span className="mono text-[9px] text-[var(--color-faint)]">{Math.round(max / 2)}</span>
            <span className="mono text-[9px] text-[var(--color-faint)]">0</span>
          </div>
          <div className="relative flex-1">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[var(--color-rule)]" />
            <div aria-hidden="true" className="absolute inset-x-0 top-[70px] h-px bg-[var(--color-rule)]" />
            <div aria-hidden="true" className="absolute inset-x-0 top-[140px] h-px bg-[var(--color-rule-2)]" />
            <div className="relative grid h-[172px] grid-cols-12 gap-1">
              {data.map((point, index) => (
                <div key={point.month} className="flex flex-col justify-end">
                  <div className="flex h-[140px] items-end justify-center gap-[2px]">
                    {series.map((item) => {
                      const value = point[item.key];
                      const height = value === 0 ? 1 : Math.max(2, Math.round((value / max) * 140));
                      return (
                        <span
                          key={item.key}
                          title={`${point.label} · ${item.label}: ${value}`}
                          className={`w-[5px] rounded-t-[1px] ${item.color} ${value === 0 ? "opacity-20" : ""}`}
                          style={{ height: `${height}px` }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-1 flex h-5 items-start justify-center">
                    <span className="mono text-[9px] text-[var(--color-muted)]">
                      {index % 2 === 0 ? point.label.split(" ")[0] : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>Offer activity by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Created</th>
            <th scope="col">Issued</th>
            <th scope="col">Accepted</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.month}>
              <th scope="row">{point.label}</th>
              <td>{formatNumber(point.created)}</td>
              <td>{formatNumber(point.issued)}</td>
              <td>{formatNumber(point.accepted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
