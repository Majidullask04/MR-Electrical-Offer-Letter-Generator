export type RoleKey = "SUPER_ADMIN" | "HR_MANAGER" | "HIRING_MANAGER";

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "TEMPORARY"
  | "INTERNSHIP";

export type OfferStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ISSUED"
  | "VIEWED"
  | "REISSUED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "WITHDRAWN";

export type ApprovalStatus = "PENDING" | "APPROVED" | "RETURNED";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  last_login_at: string | null;
  roles: RoleKey[];
  primary_role: RoleKey;
  created_at: string;
}

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string | null;
}

export interface Candidate {
  id: string;
  candidate_code?: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  current_address: string | null;
  applied_position: string;
  department: string | null;
  employment_type: EmploymentType;
  proposed_joining_date: string | null;
  reporting_manager: string | null;
  work_location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobPosition {
  id: string;
  title: string;
  department: string | null;
  is_active: boolean;
}

export interface OfferSummary {
  id: string;
  offer_number: string;
  official_offer_number?: string | null;
  status: OfferStatus;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string | null;
  job_title: string;
  department: string | null;
  employment_type: string | null;
  annual_ctc: number;
  monthly_salary: number;
  created_at: string;
  issued_at: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  revision_number: number;
  current_revision_id: string | null;
}

export interface OfferEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_type: "USER" | "CANDIDATE" | "SYSTEM";
  actor_name: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ApprovalRecord {
  id: string;
  revision_number: number;
  status: ApprovalStatus;
  requested_by_name: string | null;
  approved_by_name: string | null;
  comments: string | null;
  requested_at: string;
  decided_at: string | null;
}

export interface OfferRevision {
  id: string;
  revision_number: number;
  official_offer_number?: string | null;
  pdf_sha256?: string | null;
  issued_at: string | null;
  created_at: string;
  created_by_name: string | null;
  has_pdf: boolean;
  is_current: boolean;
}

export interface EmploymentDetails {
  job_title: string;
  department: string;
  employment_type: EmploymentType;
  joining_date: string;
  work_location: string;
  reporting_manager: string;
  probation_months: number;
  working_days: string;
  working_hours: string;
}

export interface CompensationComponent {
  name: string;
  amount: number;
  period: "MONTHLY" | "ANNUAL";
}

export interface CompensationDetails {
  currency: string;
  annual_ctc: number;
  monthly_gross: number;
  earnings: CompensationComponent[];
  deductions: CompensationComponent[];
  payment_frequency: "MONTHLY" | "QUARTERLY" | "ANNUALLY";
  notes: string | null;
}

export interface TermsDetails {
  probation: string;
  leave_policy: string;
  working_hours: string;
  confidentiality: string;
  notice_period: string;
  termination: string;
  company_policies: string;
  joining_requirements: string;
  additional_clauses: string;
}

export interface OfferData {
  employment: EmploymentDetails;
  compensation: CompensationDetails;
  terms: TermsDetails;
}

export interface OfferDetail extends OfferSummary {
  data: OfferData;
  internal_notes: string | null;
  withdrawal_reason: string | null;
  rejection_reason: string | null;
  response: "ACCEPTED" | "REJECTED" | null;
  accepted_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  token_created_at: string | null;
  token_revoked_at: string | null;
  has_active_link: boolean;
  template_id: string | null;
  template_name: string | null;
  validity_days: number;
  pdf_sha256?: string | null;
  events: OfferEvent[];
  approvals: ApprovalRecord[];
  revisions: OfferRevision[];
}

export interface OfferIssueResult {
  offer: OfferDetail;
  secure_link: string | null;
  verification_url?: string | null;
  official_offer_number?: string | null;
  pdf_sha256?: string | null;
  email_status: string;
  message: string;
}

export interface OfferPreview {
  html: string;
}

export interface DashboardCounts {
  total: number;
  draft: number;
  pending_approval: number;
  approved: number;
  issued: number;
  viewed: number;
  accepted: number;
  rejected: number;
  expired: number;
  withdrawn: number;
}

export interface MonthlyPoint {
  month: string;
  label: string;
  created: number;
  issued: number;
  accepted: number;
}

export interface PositionPoint {
  position: string;
  count: number;
}

export interface Dashboard {
  counts: DashboardCounts;
  acceptance_rate: number | null;
  rejection_rate: number | null;
  pending_approval_count: number;
  time_to_accept: { average_hours: number | null; sample_size: number };
  monthly: MonthlyPoint[];
  positions: PositionPoint[];
  recent_offers: OfferSummary[];
  recent_candidates: Candidate[];
  pending_offers: OfferSummary[];
  range_from: string | null;
  range_to: string | null;
}

export interface ReportFilters {
  date_from: string | null;
  date_to: string | null;
  status: string | null;
  position: string | null;
}

export interface OfferReport {
  rows: OfferSummary[];
  total: number;
  acceptance_rate: number | null;
  rejection_rate: number | null;
  average_time_to_accept_hours: number | null;
  filters: ReportFilters;
}

export interface NotificationItem {
  id: string;
  type: "approval" | "response" | "expiry";
  title: string;
  detail: string;
  href: string;
  created_at: string;
  tone: "attention" | "positive" | "neutral";
}

export interface Notifications {
  items: NotificationItem[];
  attention_count: number;
}

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  tagline: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  udyam_number: string | null;
  gst_number: string | null;
  cin_number: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  signatory_name: string | null;
  signatory_title: string | null;
  signatory_email: string | null;
  footer_note: string | null;
  offer_prefix: string;
  official_offer_prefix?: string;
  offer_number_format?: string;
  company_intro?: string | null;
  signature_image_data?: string | null;
  seal_image_data?: string | null;
  generator_config?: Record<string, unknown> | null;
  default_validity_days: number;
  default_probation_months: number;
  default_work_location: string | null;
  default_working_days: string | null;
  default_working_hours: string | null;
  default_terms: TermsDetails | null;
  updated_at: string;
}

export interface LetterTemplate {
  id: string;
  name: string;
  description: string | null;
  html_content: string;
  version: number;
  is_default: boolean;
  is_active: boolean;
  signatory_name: string | null;
  signatory_title: string | null;
  signatory_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateBlock {
  id: string;
  key: string;
  name: string;
  content: string;
  description: string | null;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface OutboxEmail {
  id: string;
  recipient: string;
  template_key: string;
  subject: string;
  status: string;
  provider: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  offer_id: string | null;
}

export interface SettingsSummary {
  offers: number;
  email_records: number;
  audit_records: number;
  environment: string;
}

export interface PublicCompany {
  name: string;
  legal_name: string | null;
  tagline: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  udyam_number: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  signatory_name: string | null;
  signatory_title: string | null;
}

export interface PublicOffer {
  reference: string;
  status: OfferStatus;
  company: PublicCompany;
  candidate_name: string;
  position: string;
  department: string | null;
  employment_type: string;
  joining_date: string | null;
  work_location: string | null;
  reporting_manager: string | null;
  working_days: string | null;
  working_hours: string | null;
  joining_instructions: string | null;
  offer_date: string | null;
  expires_at: string | null;
  response: "ACCEPTED" | "REJECTED" | null;
  responded_at: string | null;
  compensation: CompensationDetails;
  has_responded: boolean;
  is_expired: boolean;
  pdf_available: boolean;
  revision_number: number;
}

export interface PublicActionResponse {
  status: string;
  message: string;
  responded_at: string;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  fields?: Array<{ field: string; message: string; type?: string }>;
  [key: string]: unknown;
}

export type VerifyVerdict =
  | "VALID"
  | "INVALID"
  | "REVOKED"
  | "EXPIRED"
  | "MODIFIED_DOCUMENT"
  | "SUPERSEDED";

export interface VerifyRecord {
  offer_id: string;
  draft_reference: string | null;
  company_name: string;
  candidate_name: string;
  designation: string;
  department: string | null;
  issue_date: string | null;
  joining_date: string | null;
  expires_at: string | null;
  lifecycle_status: string;
  revision_number: number;
  verification_status: string;
  verified_at: string;
  verified_count: number;
  revoked_reason: string | null;
}

export interface VerifyResult {
  verdict: VerifyVerdict;
  headline: string;
  message: string;
  pdf_integrity: "NOT_CHECKED" | "MATCHED" | "MODIFIED" | "UNMATCHED";
  uploaded_sha256: string | null;
  official_sha256: string | null;
  record: VerifyRecord | null;
}

export interface GeneratorOfferPayload {
  candidate_code?: string | null;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  job_title: string;
  department?: string | null;
  employment_type: EmploymentType;
  joining_date: string;
  work_location?: string | null;
  reporting_manager?: string | null;
  employment_duration?: string | null;
  probation_months?: number | null;
  annual_ctc?: number | null;
  monthly_salary?: number | null;
  stipend?: number | null;
  allowances?: CompensationComponent[];
  payment_terms?: string | null;
  expiry_date?: string | null;
  validity_days?: number | null;
  responsibilities?: string | null;
  employment_terms?: string | null;
  additional_instructions?: string | null;
  template_id?: string | null;
  issue_immediately?: boolean;
}
