import type { EmploymentType, OfferStatus, RoleKey } from "@/lib/types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateLong(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatINR(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value < 24) return `${formatNumber(Math.round(value))} hr`;
  const days = value / 24;
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(days)} days`;
}

export function relativeTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let duration = diffSeconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) {
      return formatter.format(Math.round(duration), unit);
    }
    duration /= amount;
  }
  return formatter.format(Math.round(duration), "year");
}

export function daysUntil(value: string | null | undefined): number | null {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export const STATUS_LABELS: Record<OfferStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  ISSUED: "Issued",
  VIEWED: "Viewed",
  REISSUED: "Reissued",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};

export function statusLabel(status: OfferStatus | string): string {
  return STATUS_LABELS[status as OfferStatus] ?? titleCase(status);
}

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
  INTERNSHIP: "Internship",
};

export function employmentLabel(value: EmploymentType | string | null | undefined): string {
  if (!value) return "—";
  return EMPLOYMENT_LABELS[value as EmploymentType] ?? titleCase(value);
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super admin",
  HR_MANAGER: "HR manager",
  HIRING_MANAGER: "Hiring manager",
};

export function roleLabel(value: RoleKey | string | null | undefined): string {
  if (!value) return "Staff";
  return ROLE_LABELS[value as RoleKey] ?? titleCase(value);
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Offer created",
  UPDATED: "Draft updated",
  SUBMITTED: "Submitted for approval",
  APPROVED: "Approved",
  RETURNED: "Returned to HR",
  ISSUED: "Issued to candidate",
  VIEWED: "Viewed by candidate",
  LINK_REGENERATED: "Secure link regenerated",
  WITHDRAWN: "Offer withdrawn",
  REVISION_STARTED: "Revision started",
  ACCEPTED: "Offer accepted",
  REJECTED: "Offer declined",
  EXPIRED: "Offer expired",
  REMINDER_SENT: "Expiry reminder queued",
};

export function eventLabel(value: string): string {
  return EVENT_LABELS[value] ?? titleCase(value.replaceAll("_", " "));
}

export function titleCase(value: string): string {
  const cleaned = value.replaceAll("_", " ").toLowerCase();
  return cleaned.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function fileSafeReference(reference: string): string {
  return reference.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function moneyInWords(amount: number): string {
  const ones = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number): string => {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  };
  const three = (n: number): string => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundred ? `${ones[hundred]} Hundred` : ""}${hundred && rest ? " " : ""}${
      rest ? two(rest) : ""
    }`;
  };
  const value = Math.round(amount);
  if (value === 0) return "Zero rupees";
  const units: Array<[number, string]> = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
    [1, ""],
  ];
  const parts: string[] = [];
  let remaining = value;
  for (const [size, label] of units) {
    if (remaining >= size) {
      const count = Math.floor(remaining / size);
      remaining %= size;
      parts.push(`${three(count)}${label ? ` ${label}` : ""}`);
    }
  }
  return `${parts.join(" ")} rupees`;
}
