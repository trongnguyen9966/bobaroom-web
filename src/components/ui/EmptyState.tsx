export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <span className="text-2xl">📭</span>
      </div>
      <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
