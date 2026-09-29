export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="py-12 text-center text-sm text-neutral-400">{label}</div>;
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 py-12 text-center text-sm text-neutral-400">
      {label}
    </div>
  );
}

export function ErrorState({ label = "Something went wrong." }: { label?: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 py-6 text-center text-sm text-red-600">{label}</div>;
}
