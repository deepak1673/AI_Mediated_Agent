export function PlaceholderPage({ title, stage }: { title: string; stage: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <div className="mt-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
        {title} arrives in {stage}.
      </div>
    </div>
  );
}
