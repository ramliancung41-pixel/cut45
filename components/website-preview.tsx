import {
  contrastColor,
  fontStack,
  type WebsiteContent,
  type WebsiteSection,
} from "@/lib/website-content";

export function WebsitePreview({
  content,
  selectedId = null,
  onSelect,
}: {
  content: WebsiteContent;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const { theme } = content;
  const onPrimary = contrastColor(theme.primary);

  return (
    <article style={{ background: theme.background, color: theme.text, fontFamily: fontStack(theme.font) }}>
      {content.sections.map((section) => {
        const outline = selectedId === section.id ? `2px solid ${theme.primary}` : "none";
        if (!onSelect) {
          return (
            <div key={section.id}>
              <SectionView section={section} theme={theme} onPrimary={onPrimary} />
            </div>
          );
        }
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className="block w-full text-left"
            style={{ outline, outlineOffset: -2 }}
          >
            <SectionView section={section} theme={theme} onPrimary={onPrimary} />
          </button>
        );
      })}
    </article>
  );
}

function SectionView({
  section,
  theme,
  onPrimary,
}: {
  section: WebsiteSection;
  theme: WebsiteContent["theme"];
  onPrimary: string;
}) {
  if (section.type === "hero") {
    return (
      <div className="grid gap-8 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs tracking-[0.18em] uppercase" style={{ color: theme.muted }}>
            {section.eyebrow}
          </p>
          <h2 className="mt-3 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">{section.headline}</h2>
          <p className="mt-4 max-w-xl text-base leading-7" style={{ color: theme.muted }}>
            {section.subhead}
          </p>
          <span
            className="mt-6 inline-flex rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: theme.primary, color: onPrimary }}
          >
            {section.buttonLabel}
          </span>
        </div>
        <div className="overflow-hidden rounded-3xl" style={{ background: theme.surface }}>
          {section.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={section.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div
              className="grid aspect-[4/3] place-items-center text-sm"
              style={{
                background: `linear-gradient(145deg, ${theme.primary}, ${theme.background})`,
                color: onPrimary,
              }}
            >
              Section image
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section.type === "features") {
    return (
      <div className="px-6 py-12 sm:px-10" style={{ background: theme.surface }}>
        <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {section.items.map((item, index) => (
            <li key={`${section.id}-${index}`} className="rounded-2xl px-4 py-4" style={{ background: theme.background }}>
              <p className="font-medium">{item.title}</p>
              <p className="mt-2 text-sm leading-6" style={{ color: theme.muted }}>
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (section.type === "testimonials") {
    return (
      <div className="px-6 py-12 sm:px-10">
        <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {section.items.map((item, index) => (
            <li key={`${section.id}-${index}`} className="rounded-2xl px-5 py-5" style={{ background: theme.surface }}>
              <p className="text-base leading-7">“{item.quote}”</p>
              <p className="mt-3 text-sm font-medium" style={{ color: theme.muted }}>
                {item.name}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (section.type === "contact") {
    return (
      <div className="px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-xl rounded-3xl px-5 py-6" style={{ background: theme.surface }}>
          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: theme.muted }}>
            {section.body}
          </p>
          <div className="mt-5 grid gap-3">
            <Field label="Name" theme={theme} />
            <Field label="Email" theme={theme} />
            <Field label="Message" theme={theme} tall />
            <span
              className="mt-1 inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold"
              style={{ background: theme.primary, color: onPrimary }}
            >
              {section.buttonLabel}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <footer className="px-6 py-8 text-center text-sm sm:px-10" style={{ color: theme.muted }}>
      {section.text}
    </footer>
  );
}

function Field({
  label,
  theme,
  tall,
}: {
  label: string;
  theme: WebsiteContent["theme"];
  tall?: boolean;
}) {
  return (
    <label className="block text-xs font-medium" style={{ color: theme.muted }}>
      {label}
      <span
        className={`mt-1 block rounded-xl ${tall ? "h-20" : "h-10"}`}
        style={{ background: theme.background, border: `1px solid ${theme.muted}33` }}
      />
    </label>
  );
}
