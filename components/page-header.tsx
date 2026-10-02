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
    <header className="mb-8 max-w-2xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-base leading-7 text-muted">{description}</p>
    </header>
  );
}
