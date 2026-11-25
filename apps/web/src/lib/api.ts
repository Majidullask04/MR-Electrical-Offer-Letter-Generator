import type {
  ApiErrorPayload,
  AuditEntry,
  Candidate,
  Company,
  Dashboard,
  GeneratorOfferPayload,
  JobPosition,
  LetterTemplate,
  Notifications,
  OfferData,
  OfferDetail,
  OfferIssueResult,
  OfferPreview,
  OfferReport,
  OfferStatus,
  OfferSummary,
  OutboxEmail,
  Page,
  PublicActionResponse,
  PublicOffer,
  RoleDefinition,
  SettingsSummary,
  StaffUser,
  TemplateBlock,
  VerifyResult,
} from "@/lib/types";

const API_ROOT = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Array<{ field: string; message: string }>;
  payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message || "The request could not be completed.");
    this.name = "ApiError";
    this.status = status;
    this.code = payload.code || `HTTP_${status}`;
    this.fields = payload.fields ?? [];
    this.payload = payload;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

type QueryValue = string | number | boolean | null | undefined;

export function qs(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const found = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

async function request<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: BodyInit | object | null } = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  let body = init.body as BodyInit | null | undefined;

  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = readCookie("ol_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      method,
      body: body as BodyInit | null | undefined,
      headers,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "The server could not be reached. Check your connection and try again.",
    });
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ol:unauthorized"));
    }
    let payload: ApiErrorPayload = {
      code: `HTTP_${response.status}`,
      message: "The request could not be completed.",
    };
    if (contentType.includes("application/json")) {
      try {
        payload = (await response.json()) as ApiErrorPayload;
      } catch {
        payload = {
          code: `HTTP_${response.status}`,
          message: "The server returned an unreadable response.",
        };
      }
    }
    throw new ApiError(response.status, payload);
  }

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as T;
}

export function downloadUrl(path: string): string {
  return `${API_ROOT}${path}`;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<StaffUser>("/auth/login", { method: "POST", body: { email, password } }),
    logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),
    me: () => request<StaffUser>("/auth/me"),
    roles: () => request<RoleDefinition[]>("/auth/roles"),
    changePassword: (current_password: string, new_password: string) =>
      request<{ message: string }>("/auth/change-password", {
        method: "POST",
        body: { current_password, new_password },
      }),
  },
  dashboard: (params: { date_from?: string; date_to?: string; position?: string } = {}) =>
    request<Dashboard>(`/reports/dashboard${qs(params)}`),
  notifications: () => request<Notifications>("/notifications"),
  candidates: {
    list: (params: {
      q?: string;
      include_inactive?: boolean;
      page?: number;
      page_size?: number;
    }) => request<Page<Candidate>>(`/candidates${qs(params)}`),
    get: (id: string) => request<Candidate>(`/candidates/${id}`),
    create: (payload: Partial<Candidate> & Record<string, unknown>) =>
      request<Candidate>("/candidates", { method: "POST", body: payload }),
    update: (id: string, payload: Partial<Candidate> & Record<string, unknown>) =>
      request<Candidate>(`/candidates/${id}`, { method: "PATCH", body: payload }),
    remove: (id: string) =>
      request<{ message: string }>(`/candidates/${id}`, { method: "DELETE" }),
    positions: () => request<JobPosition[]>("/candidates/meta/positions"),
    createPosition: (payload: { title: string; department?: string | null }) =>
      request<JobPosition>("/candidates/meta/positions", { method: "POST", body: payload }),
  },
  offers: {
    list: (params: {
      q?: string;
      status?: string;
      position?: string;
      candidate_id?: string;
      page?: number;
      page_size?: number;
    }) => request<Page<OfferSummary>>(`/offers${qs(params)}`),
    get: (id: string) => request<OfferDetail>(`/offers/${id}`),
    create: (payload: {
      candidate_id: string;
      template_id?: string | null;
      validity_days: number;
      data: OfferData;
      internal_notes?: string | null;
    }) => request<OfferDetail>("/offers", { method: "POST", body: payload }),
    update: (
      id: string,
      payload: {
        candidate_id?: string;
        template_id?: string | null;
        validity_days?: number;
        data?: OfferData;
        internal_notes?: string | null;
      },
    ) => request<OfferDetail>(`/offers/${id}`, { method: "PATCH", body: payload }),
    preview: (payload: {
      candidate_id: string;
      template_id?: string | null;
      validity_days: number;
      data: OfferData;
    }) => request<OfferPreview>("/offers/preview", { method: "POST", body: payload }),
    submit: (id: string) => request<OfferDetail>(`/offers/${id}/submit`, { method: "POST" }),
    approve: (id: string, comments?: string) =>
      request<OfferDetail>(`/offers/${id}/approve`, { method: "POST", body: { comments } }),
    returnToHr: (id: string, comments: string) =>
      request<OfferDetail>(`/offers/${id}/return`, { method: "POST", body: { comments } }),
    issue: (id: string) =>
      request<OfferIssueResult>(`/offers/${id}/issue`, { method: "POST" }),
    withdraw: (id: string, reason: string) =>
      request<OfferDetail>(`/offers/${id}/withdraw`, { method: "POST", body: { reason } }),
    revoke: (id: string, reason: string) =>
      request<OfferDetail>(`/offers/${id}/revoke`, { method: "POST", body: { reason } }),
    revise: (id: string, reason?: string) =>
      request<OfferDetail>(`/offers/${id}/revise`, { method: "POST", body: { reason } }),
    regenerateLink: (id: string) =>
      request<OfferIssueResult>(`/offers/${id}/link`, { method: "POST" }),
    pdf: (id: string) => downloadUrl(`/offers/${id}/pdf`),
    revisionPdf: (id: string, revisionId: string) =>
      downloadUrl(`/offers/${id}/revisions/${revisionId}/pdf`),
  },
  reports: {
    offers: (params: {
      date_from?: string;
      date_to?: string;
      status?: string;
      position?: string;
    }) => request<OfferReport>(`/reports/offers${qs(params)}`),
    exportUrl: (params: {
      date_from?: string;
      date_to?: string;
      status?: string;
      position?: string;
    }) => downloadUrl(`/reports/offers/export${qs(params)}`),
  },
  templates: {
    list: () => request<LetterTemplate[]>("/templates"),
    get: (id: string) => request<LetterTemplate>(`/templates/${id}`),
    create: (payload: {
      name: string;
      description?: string | null;
      html_content: string;
      signatory_name?: string | null;
      signatory_title?: string | null;
      signatory_email?: string | null;
      is_active?: boolean;
      is_default?: boolean;
    }) => request<LetterTemplate>("/templates", { method: "POST", body: payload }),
    update: (id: string, payload: Record<string, unknown>) =>
      request<LetterTemplate>(`/templates/${id}`, { method: "PATCH", body: payload }),
    duplicate: (id: string) =>
      request<LetterTemplate>(`/templates/${id}/duplicate`, { method: "POST" }),
    makeDefault: (id: string) =>
      request<LetterTemplate>(`/templates/${id}/default`, { method: "POST" }),
    remove: (id: string) =>
      request<{ message: string }>(`/templates/${id}`, { method: "DELETE" }),
    preview: (html_content: string) =>
      request<{ html: string }>("/templates/preview", {
        method: "POST",
        body: { html_content },
      }),
    blocks: () => request<TemplateBlock[]>("/templates/blocks"),
    createBlock: (payload: {
      key: string;
      name: string;
      content: string;
      description?: string | null;
    }) => request<TemplateBlock>("/templates/blocks", { method: "POST", body: payload }),
    updateBlock: (id: string, payload: Record<string, unknown>) =>
      request<TemplateBlock>(`/templates/blocks/${id}`, { method: "PATCH", body: payload }),
    removeBlock: (id: string) =>
      request<{ message: string }>(`/templates/blocks/${id}`, { method: "DELETE" }),
  },
  company: {
    get: () => request<Company>("/company"),
    update: (payload: Record<string, unknown>) =>
      request<Company>("/company", { method: "PATCH", body: payload }),
  },
  users: {
    list: () => request<StaffUser[]>("/users"),
    create: (payload: {
      full_name: string;
      email: string;
      password: string;
      role_key: string;
    }) => request<StaffUser>("/users", { method: "POST", body: payload }),
    update: (id: string, payload: Record<string, unknown>) =>
      request<StaffUser>(`/users/${id}`, { method: "PATCH", body: payload }),
  },
  audit: {
    list: (params: {
      action?: string;
      entity_type?: string;
      date_from?: string;
      date_to?: string;
      page?: number;
      page_size?: number;
    }) => request<Page<AuditEntry>>(`/audit-logs${qs(params)}`),
  },
  settings: {
    outbox: (limit = 50) => request<OutboxEmail[]>(`/settings/outbox${qs({ limit })}`),
    outboxHtml: (id: string) => request<string>(`/settings/outbox/${id}/html`),
    summary: () => request<SettingsSummary>("/settings/summary"),
    runJob: (job: "expire" | "remind") =>
      request<{ message: string }>(`/settings/jobs/run${qs({ job })}`, { method: "POST" }),
  },
  public: {
    get: (token: string) => request<PublicOffer>(`/public/offers/${encodeURIComponent(token)}`),
    accept: (token: string, payload: { consent: boolean; typed_name?: string }) =>
      request<PublicActionResponse>(`/public/offers/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: payload,
      }),
    reject: (token: string, payload: { consent: boolean; reason?: string }) =>
      request<PublicActionResponse>(`/public/offers/${encodeURIComponent(token)}/reject`, {
        method: "POST",
        body: payload,
      }),
    pdf: (token: string) =>
      downloadUrl(`/public/offers/${encodeURIComponent(token)}/pdf`),
    preview: (token: string) =>
      downloadUrl(`/public/offers/${encodeURIComponent(token)}/preview`),
  },
  generator: {
    preview: (payload: GeneratorOfferPayload) =>
      request<OfferPreview>("/generator/preview", { method: "POST", body: payload }),
    create: (payload: GeneratorOfferPayload) =>
      request<OfferIssueResult>("/generator/offers", { method: "POST", body: payload }),
  },
  verify: {
    byToken: (token: string) =>
      request<VerifyResult>(`/public/verify/token/${encodeURIComponent(token)}`),
    lookup: (payload: {
      offer_id: string;
      candidate_email?: string;
      candidate_name?: string;
      joining_date?: string;
    }) => request<VerifyResult>("/public/verify/lookup", { method: "POST", body: payload }),
    pdf: (formData: FormData) =>
      request<VerifyResult>("/public/verify/pdf", { method: "POST", body: formData }),
  },
};

export const STATUS_OPTIONS: Array<{ value: OfferStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "ISSUED", label: "Issued" },
  { value: "VIEWED", label: "Viewed" },
  { value: "REISSUED", label: "Reissued" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];
