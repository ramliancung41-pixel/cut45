"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  contrastColor,
  fontStack,
  type FeatureIcon,
  type TestimonialItem,
  type WebsiteContent,
  type WebsiteSection,
  type WebsiteTheme,
} from "@/lib/website-content";

export function WebsitePreview({
  content,
  selectedId = null,
  onSelect,
  onEdit,
}: {
  content: WebsiteContent;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onEdit?: (id: string, recipe: (section: WebsiteSection) => WebsiteSection) => void;
}) {
  const { theme } = content;
  const onPrimary = contrastColor(theme.primary);
  const editing = Boolean(onEdit);

  return (
    <article className="min-h-full w-full" style={{ background: theme.background, color: theme.text, fontFamily: fontStack(theme.font) }}>
      {content.sections.map((section) => (
        <div
          key={section.id}
          onClick={onSelect ? () => onSelect(section.id) : undefined}
          style={selectedId === section.id ? { outline: `2px solid ${theme.primary}`, outlineOffset: -2 } : undefined}
        >
          <SectionView
            section={section}
            theme={theme}
            onPrimary={onPrimary}
            editing={editing}
            onActivate={() => onSelect?.(section.id)}
            onChange={(recipe) => onEdit?.(section.id, recipe)}
          />
        </div>
      ))}
    </article>
  );
}

function EditText({
  value,
  editing,
  label,
  className,
  style,
  onChange,
  onActivate,
}: {
  value: string;
  editing: boolean;
  label: string;
  className?: string;
  style?: CSSProperties;
  onChange?: (value: string) => void;
  onActivate?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const live = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || live.current) return;
    if (node.textContent !== value) node.textContent = value;
  }, [value]);

  if (!editing || !onChange) {
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }

  return (
    <span
      ref={(node) => {
        ref.current = node;
        if (node && !live.current && node.textContent !== value) node.textContent = value;
      }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      spellCheck
      className={className}
      style={{ ...style, cursor: "text" }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onFocus={() => {
        live.current = true;
        onActivate?.();
      }}
      onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
      onBlur={(event) => {
        live.current = false;
        const next = (event.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        const safe = next || value;
        onChange(safe);
        if (event.currentTarget.textContent !== safe) event.currentTarget.textContent = safe;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function SectionView({
  section,
  theme,
  onPrimary,
  editing,
  onChange,
  onActivate,
}: {
  section: WebsiteSection;
  theme: WebsiteTheme;
  onPrimary: string;
  editing: boolean;
  onChange: (recipe: (section: WebsiteSection) => WebsiteSection) => void;
  onActivate: () => void;
}) {
  if (section.type === "nav") {
    return (
      <header
        className="sticky top-0 z-20 border-b backdrop-blur-xl"
        style={{
          background: `color-mix(in srgb, ${theme.background} 72%, transparent)`,
          borderColor: `color-mix(in srgb, ${theme.text} 12%, transparent)`,
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
          <EditText
            value={section.brand}
            editing={editing}
            label="Navbar brand"
            className="text-sm font-semibold tracking-tight"
            onActivate={onActivate}
            onChange={(brand) => onChange((item) => (item.type === "nav" ? { ...item, brand } : item))}
          />
          <nav className="ml-auto hidden items-center gap-5 text-sm sm:flex" style={{ color: theme.muted }}>
            {section.links.map((link, index) => (
              <EditText
                key={`${section.id}-link-${index}`}
                value={link}
                editing={editing}
                label={`Navbar link ${index + 1}`}
                onActivate={onActivate}
                onChange={(next) =>
                  onChange((item) =>
                    item.type === "nav" ? { ...item, links: item.links.map((entry, entryIndex) => (entryIndex === index ? next : entry)) } : item,
                  )
                }
              />
            ))}
          </nav>
          <EditText
            value={section.buttonLabel}
            editing={editing}
            label="Navbar button"
            className="rounded-full px-3 py-1.5 text-xs font-semibold sm:ml-2"
            style={{ background: theme.primary, color: onPrimary }}
            onActivate={onActivate}
            onChange={(buttonLabel) => onChange((item) => (item.type === "nav" ? { ...item, buttonLabel } : item))}
          />
        </div>
      </header>
    );
  }

  if (section.type === "hero") {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <EditText
            value={section.eyebrow}
            editing={editing}
            label="Hero eyebrow"
            className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.16em] uppercase"
            style={{ background: `color-mix(in srgb, ${theme.primary} 14%, ${theme.surface})`, color: theme.primary }}
            onActivate={onActivate}
            onChange={(eyebrow) => onChange((item) => (item.type === "hero" ? { ...item, eyebrow } : item))}
          />
          <EditText
            value={section.headline}
            editing={editing}
            label="Hero headline"
            className="mt-5 block max-w-xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl"
            onActivate={onActivate}
            onChange={(headline) => onChange((item) => (item.type === "hero" ? { ...item, headline } : item))}
          />
          <EditText
            value={section.subhead}
            editing={editing}
            label="Hero subhead"
            className="mt-5 block max-w-xl text-base leading-7 sm:text-lg"
            style={{ color: theme.muted }}
            onActivate={onActivate}
            onChange={(subhead) => onChange((item) => (item.type === "hero" ? { ...item, subhead } : item))}
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <EditText
              value={section.buttonLabel}
              editing={editing}
              label="Hero button"
              className="inline-flex rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ background: theme.primary, color: onPrimary }}
              onActivate={onActivate}
              onChange={(buttonLabel) => onChange((item) => (item.type === "hero" ? { ...item, buttonLabel } : item))}
            />
            <EditText
              value={section.secondaryLabel}
              editing={editing}
              label="Hero second button"
              className="inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold"
              style={{ borderColor: `color-mix(in srgb, ${theme.text} 18%, transparent)` }}
              onActivate={onActivate}
              onChange={(secondaryLabel) => onChange((item) => (item.type === "hero" ? { ...item, secondaryLabel } : item))}
            />
          </div>
        </div>
        <figure className="overflow-hidden rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.18)]" style={{ background: theme.surface }}>
          {section.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={section.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="grid aspect-[4/3] place-items-center text-sm" style={{ background: `linear-gradient(145deg, ${theme.primary}, ${theme.surface})`, color: onPrimary }}>
              Add a photo
            </div>
          )}
        </figure>
      </div>
    );
  }

  if (section.type === "features") {
    return (
      <div className="px-5 py-16 sm:px-8" style={{ background: theme.surface }}>
        <div className="mx-auto w-full max-w-6xl">
          <EditText
            value={section.title}
            editing={editing}
            label="Features heading"
            className="block max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl"
            onActivate={onActivate}
            onChange={(title) => onChange((item) => (item.type === "features" ? { ...item, title } : item))}
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {section.items.map((item, index) => (
              <li
                key={`${section.id}-feature-${index}`}
                className="rounded-3xl border p-5"
                style={{ background: theme.background, borderColor: `color-mix(in srgb, ${theme.text} 10%, transparent)` }}
              >
                <span
                  className="grid h-11 w-11 place-items-center rounded-2xl"
                  style={{ background: `color-mix(in srgb, ${theme.primary} 16%, ${theme.surface})`, color: theme.primary }}
                >
                  <FeatureMark name={item.icon} />
                </span>
                <EditText
                  value={item.title}
                  editing={editing}
                  label={`Feature ${index + 1} title`}
                  className="mt-4 block text-lg font-semibold"
                  onActivate={onActivate}
                  onChange={(title) =>
                    onChange((current) =>
                      current.type === "features"
                        ? { ...current, items: current.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, title } : entry)) }
                        : current,
                    )
                  }
                />
                <EditText
                  value={item.body}
                  editing={editing}
                  label={`Feature ${index + 1} description`}
                  className="mt-2 block text-sm leading-6"
                  style={{ color: theme.muted }}
                  onActivate={onActivate}
                  onChange={(body) =>
                    onChange((current) =>
                      current.type === "features"
                        ? { ...current, items: current.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, body } : entry)) }
                        : current,
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (section.type === "testimonials") {
    return (
      <div className="px-5 py-16 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <EditText
            value={section.title}
            editing={editing}
            label="Testimonials heading"
            className="block text-3xl font-semibold tracking-tight sm:text-4xl"
            onActivate={onActivate}
            onChange={(title) => onChange((item) => (item.type === "testimonials" ? { ...item, title } : item))}
          />
          <QuoteSlider
            items={section.items}
            theme={theme}
            editing={editing}
            onActivate={onActivate}
            onChange={(index, patch) =>
              onChange((current) =>
                current.type === "testimonials"
                  ? { ...current, items: current.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)) }
                  : current,
              )
            }
          />
        </div>
      </div>
    );
  }

  if (section.type === "pricing") {
    return (
      <div className="px-5 py-16 sm:px-8" style={{ background: theme.surface }}>
        <div className="mx-auto w-full max-w-6xl">
          <EditText
            value={section.title}
            editing={editing}
            label="Pricing heading"
            className="block text-3xl font-semibold tracking-tight sm:text-4xl"
            onActivate={onActivate}
            onChange={(title) => onChange((item) => (item.type === "pricing" ? { ...item, title } : item))}
          />
          <ul className="mt-8 grid gap-4 lg:grid-cols-3">
            {section.plans.map((plan, index) => {
              const featured = index === 1;
              const tone = featured ? onPrimary : theme.muted;
              const patch = (field: "name" | "price" | "detail", value: string) =>
                onChange((current) =>
                  current.type === "pricing"
                    ? { ...current, plans: current.plans.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [field]: value } : entry)) }
                    : current,
                );
              return (
                <li
                  key={`${section.id}-plan-${index}`}
                  className="rounded-3xl border p-6"
                  style={{
                    background: featured ? theme.primary : theme.background,
                    color: featured ? onPrimary : theme.text,
                    borderColor: featured ? theme.primary : `color-mix(in srgb, ${theme.text} 10%, transparent)`,
                  }}
                >
                  <EditText value={plan.name} editing={editing} label={`Plan ${index + 1} name`} className="block text-sm" style={{ color: tone }} onActivate={onActivate} onChange={(name) => patch("name", name)} />
                  <EditText value={plan.price} editing={editing} label={`Plan ${index + 1} price`} className="mt-3 block text-4xl font-semibold tracking-tight" onActivate={onActivate} onChange={(price) => patch("price", price)} />
                  <EditText value={plan.detail} editing={editing} label={`Plan ${index + 1} description`} className="mt-2 block text-sm leading-6" style={{ color: tone }} onActivate={onActivate} onChange={(detail) => patch("detail", detail)} />
                  <ul className="mt-5 space-y-2 text-sm">
                    {plan.points.map((point, pointIndex) => (
                      <li key={`${section.id}-plan-${index}-point-${pointIndex}`}>
                        <EditText
                          value={point}
                          editing={editing}
                          label={`Plan ${index + 1} point ${pointIndex + 1}`}
                          onActivate={onActivate}
                          onChange={(next) =>
                            onChange((current) =>
                              current.type === "pricing"
                                ? {
                                    ...current,
                                    plans: current.plans.map((entry, entryIndex) =>
                                      entryIndex === index
                                        ? { ...entry, points: entry.points.map((item, itemIndex) => (itemIndex === pointIndex ? next : item)) }
                                        : entry,
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  if (section.type === "contact") {
    return (
      <div id="contact" className="px-5 py-16 sm:px-8">
        <div
          className="mx-auto grid w-full max-w-6xl gap-8 rounded-[28px] p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr]"
          style={{ background: theme.surface }}
        >
          <div>
            <EditText
              value={section.title}
              editing={editing}
              label="Contact heading"
              className="block text-3xl font-semibold tracking-tight"
              onActivate={onActivate}
              onChange={(title) => onChange((item) => (item.type === "contact" ? { ...item, title } : item))}
            />
            <EditText
              value={section.body}
              editing={editing}
              label="Contact description"
              className="mt-3 block text-sm leading-6"
              style={{ color: theme.muted }}
              onActivate={onActivate}
              onChange={(body) => onChange((item) => (item.type === "contact" ? { ...item, body } : item))}
            />
          </div>
          <div className="grid gap-3">
            <Field label="Name" theme={theme} />
            <Field label="Email" theme={theme} />
            <Field label="Message" theme={theme} tall />
            <EditText
              value={section.buttonLabel}
              editing={editing}
              label="Contact button"
              className="mt-1 inline-flex w-fit rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ background: theme.primary, color: onPrimary }}
              onActivate={onActivate}
              onChange={(buttonLabel) => onChange((item) => (item.type === "contact" ? { ...item, buttonLabel } : item))}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <footer className="px-5 py-12 sm:px-8" style={{ background: theme.text, color: theme.background }}>
      <div className="mx-auto grid w-full max-w-6xl gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <EditText
            value={section.text.replace(/^©\s*/, "")}
            editing={editing}
            label="Footer name"
            className="block text-lg font-semibold"
            onActivate={onActivate}
            onChange={(name) => onChange((item) => (item.type === "footer" ? { ...item, text: name.startsWith("©") ? name : `© ${name}` } : item))}
          />
          <EditText
            value={section.note}
            editing={editing}
            label="Footer note"
            className="mt-3 block max-w-sm text-sm leading-6"
            style={{ color: `color-mix(in srgb, ${theme.background} 72%, transparent)` }}
            onActivate={onActivate}
            onChange={(note) => onChange((item) => (item.type === "footer" ? { ...item, note } : item))}
          />
        </div>
        <div>
          <p className="text-xs tracking-[0.16em] uppercase" style={{ color: `color-mix(in srgb, ${theme.background} 60%, transparent)` }}>
            Studio
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {section.links.map((link, index) => (
              <li key={`${section.id}-footer-link-${index}`}>
                <EditText
                  value={link}
                  editing={editing}
                  label={`Footer link ${index + 1}`}
                  onActivate={onActivate}
                  onChange={(next) =>
                    onChange((item) =>
                      item.type === "footer" ? { ...item, links: item.links.map((entry, entryIndex) => (entryIndex === index ? next : entry)) } : item,
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs tracking-[0.16em] uppercase" style={{ color: `color-mix(in srgb, ${theme.background} 60%, transparent)` }}>
            Start
          </p>
          <p className="mt-3 text-sm">Book from the page, then publish on your domain.</p>
        </div>
      </div>
      <p className="mx-auto mt-10 w-full max-w-6xl text-xs" style={{ color: `color-mix(in srgb, ${theme.background} 55%, transparent)` }}>
        {section.text}
      </p>
    </footer>
  );
}

function QuoteSlider({
  items,
  theme,
  editing,
  onActivate,
  onChange,
}: {
  items: TestimonialItem[];
  theme: WebsiteTheme;
  editing: boolean;
  onActivate: () => void;
  onChange: (index: number, patch: Partial<TestimonialItem>) => void;
}) {
  const [index, setIndex] = useState(0);
  const quote = items[index] ?? items[0];

  useEffect(() => {
    if (editing || items.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [editing, items.length]);

  if (!quote) return null;

  function go(next: number) {
    setIndex((next + items.length) % items.length);
  }

  return (
    <div className="mt-8 rounded-[28px] p-6 sm:p-10" style={{ background: theme.surface }}>
      <p className="max-w-3xl text-2xl leading-snug font-medium tracking-tight sm:text-3xl">
        “
        <EditText
          value={quote.quote}
          editing={editing}
          label="Testimonial quote"
          onActivate={onActivate}
          onChange={(next) => onChange(index, { quote: next })}
        />
        ”
      </p>
      <EditText
        value={quote.name}
        editing={editing}
        label="Testimonial name"
        className="mt-6 block text-sm font-semibold"
        onActivate={onActivate}
        onChange={(name) => onChange(index, { name })}
      />
      <EditText
        value={quote.role}
        editing={editing}
        label="Testimonial role"
        className="block text-sm"
        style={{ color: theme.muted }}
        onActivate={onActivate}
        onChange={(role) => onChange(index, { role })}
      />
      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            go(index - 1);
          }}
          className="rounded-full border px-3 py-1.5 text-xs"
          style={{ borderColor: `color-mix(in srgb, ${theme.text} 16%, transparent)` }}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            go(index + 1);
          }}
          className="rounded-full border px-3 py-1.5 text-xs"
          style={{ borderColor: `color-mix(in srgb, ${theme.text} 16%, transparent)` }}
        >
          Next
        </button>
        <span className="ml-2 text-xs" style={{ color: theme.muted }}>
          {index + 1} / {items.length}
        </span>
      </div>
    </div>
  );
}

function FeatureMark({ name }: { name: FeatureIcon }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "layers") {
    return (
      <svg {...common} aria-hidden>
        <path d="m12 3 9 5-9 5L3 8l9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 16 9 5 9-5" />
      </svg>
    );
  }
  if (name === "bolt") {
    return (
      <svg {...common} aria-hidden>
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg {...common} aria-hidden>
        <path d="M12 3 5 6v6c0 4.5 3 7 7 9 4-2 7-4.5 7-9V6l-7-3Z" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg {...common} aria-hidden>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 14 4-4 3 3 5-6" />
      </svg>
    );
  }
  if (name === "globe") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.5 2.8 2.5 14.2 0 18" />
        <path d="M12 3c-2.5 2.8-2.5 14.2 0 18" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </svg>
  );
}

function Field({ label, theme, tall }: { label: string; theme: WebsiteTheme; tall?: boolean }) {
  return (
    <label className="block text-xs font-medium" style={{ color: theme.muted }}>
      {label}
      <span
        className={`mt-1 block rounded-xl ${tall ? "h-24" : "h-11"}`}
        style={{ background: theme.background, border: `1px solid color-mix(in srgb, ${theme.text} 12%, transparent)` }}
      />
    </label>
  );
}
