const COLORS: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700 border-green-200",
  ALLOW: "bg-green-50 text-green-700 border-green-200",
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  HITL_REQUIRED: "bg-amber-50 text-amber-700 border-amber-200",
  WAITING_HITL: "bg-amber-50 text-amber-700 border-amber-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  HARD_DENY: "bg-red-50 text-red-700 border-red-200",
  DENIED: "bg-red-50 text-red-700 border-red-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  DEPRECATED: "bg-neutral-100 text-neutral-500 border-neutral-200",
  BROKEN: "bg-red-50 text-red-700 border-red-200",
  UNUSED: "bg-neutral-100 text-neutral-500 border-neutral-200",
  PUBLIC: "bg-blue-50 text-blue-700 border-blue-200",
  INTERNAL: "bg-neutral-100 text-neutral-600 border-neutral-200",
  PII: "bg-purple-50 text-purple-700 border-purple-200",
  CONFIDENTIAL: "bg-purple-50 text-purple-700 border-purple-200",
  RESTRICTED: "bg-red-50 text-red-700 border-red-200",
  FINANCIAL: "bg-amber-50 text-amber-700 border-amber-200",
};

export function StatusBadge({ value }: { value: string }) {
  const cls = COLORS[value] ?? "bg-neutral-100 text-neutral-600 border-neutral-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
