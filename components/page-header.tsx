export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-5 max-w-2xl sm:mb-8">
      <div className="hidden md:block">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
          {title}
        </h1>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground md:hidden">{title}</h1>
      <details className="mt-3 sm:hidden">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Info / Help</summary>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </details>
      <p className="mt-3 hidden text-base leading-7 text-muted sm:block">{description}</p>
    </header>
  );
}
