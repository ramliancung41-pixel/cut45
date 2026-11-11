"use client";

import { useEffect, useState } from "react";
import {
  blankSection,
  SECTION_LABEL,
  SECTION_TYPES,
  type FontChoice,
  type WebsiteContent,
  type WebsiteSection,
} from "@/lib/website-content";
import { WebsitePreview } from "@/components/website-preview";

type Asset = { name: string; url: string };

type BuilderProject = {
  id: string;
  title: string;
  slug: string;
  content: WebsiteContent;
};

const FONTS: Array<{ id: FontChoice; label: string }> = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
];

export function WebsiteBuilder({
  templateId,
  project,
  initialTitle,
  initialSlug,
  initialContent,
}: {
  templateId: string;
  project: BuilderProject | null;
  initialTitle: string;
  initialSlug: string;
  initialContent: WebsiteContent;
}) {
  const [projectId, setProjectId] = useState(project?.id ?? null);
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [content, setContent] = useState(initialContent);
  const [selectedId, setSelectedId] = useState(initialContent.sections[0]?.id ?? null);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [panel, setPanel] = useState<"sections" | "theme">("sections");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const selected = content.sections.find((section) => section.id === selectedId) ?? content.sections[0] ?? null;

  useEffect(() => {
    void fetch("/api/projects/assets")
      .then((response) => response.json())
      .then((payload: { assets?: Asset[] }) => {
        if (Array.isArray(payload.assets)) setAssets(payload.assets);
      })
      .catch(() => undefined);
  }, []);

  function markDirty() {
    setStatus("dirty");
    setMessage("");
  }

  function updateContent(next: WebsiteContent) {
    setContent(next);
    markDirty();
  }

  function updateSection(id: string, recipe: (section: WebsiteSection) => WebsiteSection) {
    updateContent({
      ...content,
      sections: content.sections.map((section) => (section.id === id ? recipe(section) : section)),
    });
  }

  function moveSection(from: number, to: number) {
    if (to < 0 || to >= content.sections.length || from === to) return;
    const sections = content.sections.slice();
    const [item] = sections.splice(from, 1);
    if (!item) return;
    sections.splice(to, 0, item);
    updateContent({ ...content, sections });
  }

  function addSection(type: WebsiteSection["type"]) {
    if (content.sections.length >= 12) return;
    const section = blankSection(type, `s${Math.random().toString(36).slice(2, 10)}`);
    updateContent({ ...content, sections: [...content.sections, section] });
    setSelectedId(section.id);
    setPanel("sections");
  }

  function removeSection(id: string) {
    if (content.sections.length <= 1) return;
    const sections = content.sections.filter((section) => section.id !== id);
    updateContent({ ...content, sections });
    if (selectedId === id) setSelectedId(sections[0]?.id ?? null);
  }

  async function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      setStatus("error");
      setMessage("Name the website before saving.");
      return;
    }
    setStatus("saving");
    setMessage("");
    const payload = { title: trimmed, slug, content, template: templateId };
    const response = await fetch(projectId ? `/api/projects/${projectId}` : "/api/projects", {
      method: projectId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { project?: BuilderProject; error?: string } | null;
    if (!response.ok || !body?.project) {
      setStatus("error");
      setMessage(body?.error ?? "The website could not be saved.");
      return;
    }
    setProjectId(body.project.id);
    setTitle(body.project.title);
    setSlug(body.project.slug);
    setContent(body.project.content);
    setStatus("saved");
    window.history.replaceState(null, "", `/builder?project=${body.project.id}`);
  }

  async function uploadImage(file: File) {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/projects/assets", { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as { asset?: Asset; error?: string } | null;
    if (!response.ok || !body?.asset) {
      setStatus("error");
      setMessage(body?.error ?? "The image could not be stored.");
      return;
    }
    setAssets((current) => [body.asset!, ...current.filter((item) => item.url !== body.asset!.url)]);
    if (selected?.type === "hero") {
      updateSection(selected.id, (section) => (section.type === "hero" ? { ...section, imageUrl: body.asset!.url } : section));
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#09090b] text-white lg:flex-row">
      <aside className="flex max-h-[48dvh] w-full shrink-0 flex-col border-white/10 border-b lg:max-h-none lg:w-[340px] lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.18em] text-zinc-400 uppercase">Builder</p>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                markDirty();
              }}
              aria-label="Website title"
              className="mt-1 w-full bg-transparent text-base font-semibold outline-none"
            />
          </div>
          <button type="button" onClick={() => void save()} disabled={status === "saving"} className="gen-cta shrink-0 px-3 py-2 text-xs">
            {status === "saving" ? "Saving" : "Save"}
          </button>
        </div>
        <p className="px-4 py-2 text-xs text-zinc-400" role="status">
          {message || (status === "dirty" ? "Unsaved changes" : status === "saved" ? `Saved as /${slug}` : "Saving")}
        </p>
        <div className="grid grid-cols-2 gap-1 px-4">
          {(["sections", "theme"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={panel === item}
              onClick={() => setPanel(item)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${panel === item ? "bg-white text-black" : "text-zinc-300"}`}
            >
              {item === "sections" ? "Sections" : "Theme"}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {panel === "theme" ? (
            <ThemeControls
              content={content}
              onChange={(theme) => updateContent({ ...content, theme })}
            />
          ) : (
            <>
              <ul className="space-y-2">
                {content.sections.map((section, index) => (
                  <li
                    key={section.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex == null) return;
                      moveSection(dragIndex, index);
                      setDragIndex(null);
                    }}
                  >
                    <div className={`rounded-2xl border px-3 py-2 ${selected?.id === section.id ? "border-white" : "border-white/10"}`}>
                      <button type="button" onClick={() => setSelectedId(section.id)} className="w-full text-left text-sm font-medium">
                        {SECTION_LABEL[section.type]}
                      </button>
                      <div className="mt-2 flex gap-2 text-[11px] text-zinc-400">
                        <button type="button" onClick={() => moveSection(index, index - 1)} disabled={index === 0}>
                          Up
                        </button>
                        <button type="button" onClick={() => moveSection(index, index + 1)} disabled={index === content.sections.length - 1}>
                          Down
                        </button>
                        <button type="button" onClick={() => removeSection(section.id)} disabled={content.sections.length <= 1}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {SECTION_TYPES.map((type) => (
                  <button key={type} type="button" onClick={() => addSection(type)} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px]">
                    Add {SECTION_LABEL[type]}
                  </button>
                ))}
              </div>
              {selected ? (
                <SectionFields
                  section={selected}
                  assets={assets}
                  onChange={(recipe) => updateSection(selected.id, recipe)}
                  onUpload={(file) => void uploadImage(file)}
                />
              ) : null}
            </>
          )}
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <p className="mr-auto text-xs tracking-[0.16em] text-zinc-400 uppercase">Live preview</p>
          {(["desktop", "mobile"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={viewport === item}
              onClick={() => setViewport(item)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${viewport === item ? "bg-white text-black" : "text-zinc-300"}`}
            >
              {item === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <div className={viewport === "mobile" ? "mx-auto w-[390px] max-w-full" : "mx-auto w-full max-w-[1100px]"}>
            <div className="overflow-hidden rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <WebsitePreview content={content} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ThemeControls({
  content,
  onChange,
}: {
  content: WebsiteContent;
  onChange: (theme: WebsiteContent["theme"]) => void;
}) {
  const colors: Array<{ key: keyof Pick<WebsiteContent["theme"], "primary" | "background" | "surface" | "text" | "muted">; label: string }> = [
    { key: "primary", label: "Primary" },
    { key: "background", label: "Background" },
    { key: "surface", label: "Surface" },
    { key: "text", label: "Text" },
    { key: "muted", label: "Muted" },
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-zinc-400">Typography</p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              aria-pressed={content.theme.font === font.id}
              onClick={() => onChange({ ...content.theme, font: font.id })}
              className={`rounded-full px-2 py-1.5 text-xs ${content.theme.font === font.id ? "bg-white text-black" : "border border-white/15"}`}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>
      {colors.map((color) => (
        <label key={color.key} className="flex items-center justify-between gap-3 text-sm">
          {color.label}
          <input
            type="color"
            value={toFullHex(content.theme[color.key])}
            aria-label={color.label}
            onChange={(event) => onChange({ ...content.theme, [color.key]: event.target.value })}
            className="h-8 w-12 cursor-pointer bg-transparent"
          />
        </label>
      ))}
    </div>
  );
}

function SectionFields({
  section,
  assets,
  onChange,
  onUpload,
}: {
  section: WebsiteSection;
  assets: Asset[];
  onChange: (recipe: (section: WebsiteSection) => WebsiteSection) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
      <p className="text-xs tracking-[0.16em] text-zinc-400 uppercase">{SECTION_LABEL[section.type]} copy</p>
      {section.type === "hero" ? (
        <>
          <TextField label="Eyebrow" value={section.eyebrow} onChange={(eyebrow) => onChange((item) => (item.type === "hero" ? { ...item, eyebrow } : item))} />
          <TextField label="Headline" value={section.headline} onChange={(headline) => onChange((item) => (item.type === "hero" ? { ...item, headline } : item))} />
          <TextField label="Subhead" value={section.subhead} onChange={(subhead) => onChange((item) => (item.type === "hero" ? { ...item, subhead } : item))} multiline />
          <TextField label="Button" value={section.buttonLabel} onChange={(buttonLabel) => onChange((item) => (item.type === "hero" ? { ...item, buttonLabel } : item))} />
          <ImagePicker
            assets={assets}
            selected={section.imageUrl}
            onSelect={(imageUrl) => onChange((item) => (item.type === "hero" ? { ...item, imageUrl } : item))}
            onUpload={onUpload}
          />
        </>
      ) : null}
      {section.type === "features" ? (
        <>
          <TextField label="Title" value={section.title} onChange={(title) => onChange((item) => (item.type === "features" ? { ...item, title } : item))} />
          {section.items.map((item, index) => (
            <div key={`${section.id}-${index}`} className="space-y-2 rounded-2xl border border-white/10 p-3">
              <TextField
                label={`Feature ${index + 1}`}
                value={item.title}
                onChange={(title) =>
                  onChange((current) =>
                    current.type === "features"
                      ? { ...current, items: current.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, title } : entry)) }
                      : current,
                  )
                }
              />
              <TextField
                label="Body"
                value={item.body}
                multiline
                onChange={(body) =>
                  onChange((current) =>
                    current.type === "features"
                      ? { ...current, items: current.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, body } : entry)) }
                      : current,
                  )
                }
              />
            </div>
          ))}
        </>
      ) : null}
      {section.type === "testimonials" ? (
        <>
          <TextField label="Title" value={section.title} onChange={(title) => onChange((item) => (item.type === "testimonials" ? { ...item, title } : item))} />
          {section.items.map((item, index) => (
            <div key={`${section.id}-${index}`} className="space-y-2 rounded-2xl border border-white/10 p-3">
              <TextField
                label="Quote"
                value={item.quote}
                multiline
                onChange={(quote) =>
                  onChange((current) =>
                    current.type === "testimonials"
                      ? { ...current, items: current.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quote } : entry)) }
                      : current,
                  )
                }
              />
              <TextField
                label="Name"
                value={item.name}
                onChange={(name) =>
                  onChange((current) =>
                    current.type === "testimonials"
                      ? { ...current, items: current.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, name } : entry)) }
                      : current,
                  )
                }
              />
            </div>
          ))}
        </>
      ) : null}
      {section.type === "contact" ? (
        <>
          <TextField label="Title" value={section.title} onChange={(title) => onChange((item) => (item.type === "contact" ? { ...item, title } : item))} />
          <TextField label="Body" value={section.body} multiline onChange={(body) => onChange((item) => (item.type === "contact" ? { ...item, body } : item))} />
          <TextField label="Button" value={section.buttonLabel} onChange={(buttonLabel) => onChange((item) => (item.type === "contact" ? { ...item, buttonLabel } : item))} />
        </>
      ) : null}
      {section.type === "footer" ? (
        <TextField label="Footer text" value={section.text} onChange={(text) => onChange((item) => (item.type === "footer" ? { ...item, text } : item))} />
      ) : null}
    </div>
  );
}

function ImagePicker({
  assets,
  selected,
  onSelect,
  onUpload,
}: {
  assets: Asset[];
  selected: string;
  onSelect: (url: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-400">Section image</p>
      <label className="mt-2 inline-flex cursor-pointer rounded-full border border-white/15 px-3 py-1.5 text-xs">
        Upload to assets
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = "";
          }}
        />
      </label>
      {assets.length > 0 ? (
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {assets.map((asset) => (
            <li key={asset.url}>
              <button
                type="button"
                onClick={() => onSelect(asset.url)}
                aria-label={`Use ${asset.name}`}
                aria-pressed={selected === asset.url}
                className={`block overflow-hidden rounded-lg border ${selected === asset.url ? "border-white" : "border-white/10"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url} alt="" className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Saved images from the user assets bucket appear here.</p>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const className = "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none";
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className={className} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className={className} />
      )}
    </label>
  );
}

function toFullHex(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  return "#111111";
}
