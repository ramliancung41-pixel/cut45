export function StudioPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">{eyebrow}</p>
        <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-[-0.03em] text-white">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
        checked ? "border-violet-400/60 bg-violet-500" : "border-white/10 bg-white/10"
      }`}
    >
      <span
        aria-hidden
        className={`h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
