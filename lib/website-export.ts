import { contrastColor, fontStack, type FeatureIcon, type WebsiteContent, type WebsiteSection } from "@/lib/website-content";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(value: string | undefined, fallback: string) {
  const href = (value ?? "").trim() || fallback;
  if (/^#[a-z0-9-]{1,40}$/i.test(href)) return href;
  if (/^https:\/\/[^\s"'<>]+$/.test(href)) return escapeHtml(href);
  return fallback;
}
function safeImage(url: string) {
  if (!/^https:\/\/[^\s"'<>]+$/.test(url)) return "";
  return escapeHtml(url);
}

function iconSvg(name: FeatureIcon) {
  const paths: Record<FeatureIcon, string> = {
    spark: `<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>`,
    layers: `<path d="m12 3 9 5-9 5L3 8l9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>`,
    bolt: `<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>`,
    shield: `<path d="M12 3 5 6v6c0 4.5 3 7 7 9 4-2 7-4.5 7-9V6l-7-3Z"/>`,
    chart: `<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 14 4-4 3 3 5-6"/>`,
    globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.8 2.5 14.2 0 18"/><path d="M12 3c-2.5 2.8-2.5 14.2 0 18"/>`,
  };
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function sectionHtml(section: WebsiteSection, theme: WebsiteContent["theme"]) {
  if (section.type === "nav") {
    const links = section.links.map((link) => `<span>${escapeHtml(link)}</span>`).join("");
    return `<header class="nav">
      <strong>${escapeHtml(section.brand)}</strong>
      <nav>${links}</nav>
      <a href="${safeHref(section.buttonHref, "#contact")}">${escapeHtml(section.buttonLabel)}</a>
    </header>`;
  }
  if (section.type === "hero") {
    const image = safeImage(section.imageUrl);
    const media = image
      ? `<img src="${image}" alt="" />`
      : `<div class="photo-fallback">Add a photo</div>`;
    return `<section class="hero">
      <div>
        <p class="eyebrow">${escapeHtml(section.eyebrow)}</p>
        <h1>${escapeHtml(section.headline)}</h1>
        <p class="lede">${escapeHtml(section.subhead)}</p>
        <div class="actions">
          <a class="primary" href="${safeHref(section.buttonHref, "#contact")}">${escapeHtml(section.buttonLabel)}</a>
          <a class="secondary" href="${safeHref(section.secondaryHref, "#work")}">${escapeHtml(section.secondaryLabel)}</a>
        </div>
      </div>
      <figure>${media}</figure>
    </section>`;
  }
  if (section.type === "features") {
    const items = section.items
      .map(
        (item) => `<li>
          <span class="icon">${iconSvg(item.icon)}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.body)}</p>
        </li>`,
      )
      .join("");
    return `<section id="work" class="features"><div class="wrap"><h2>${escapeHtml(section.title)}</h2><ul>${items}</ul></div></section>`;
  }
  if (section.type === "testimonials") {
    const slides = section.items
      .map(
        (item, index) => `<blockquote ${index === 0 ? "" : "hidden"}>
          <p>“${escapeHtml(item.quote)}”</p>
          <footer><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.role)}</span></footer>
        </blockquote>`,
      )
      .join("");
    return `<section class="quotes" data-slider><div class="wrap"><h2>${escapeHtml(section.title)}</h2><div class="stage">${slides}</div><div class="controls"><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button></div></div></section>`;
  }
  if (section.type === "pricing") {
    const plans = section.plans
      .map((plan, index) => {
        const points = plan.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
        return `<li class="${index === 1 ? "featured" : ""}"><p>${escapeHtml(plan.name)}</p><strong>${escapeHtml(plan.price)}</strong><span>${escapeHtml(plan.detail)}</span><ul>${points}</ul></li>`;
      })
      .join("");
    return `<section class="pricing"><div class="wrap"><h2>${escapeHtml(section.title)}</h2><ul>${plans}</ul></div></section>`;
  }
  if (section.type === "contact") {
    return `<section id="contact" class="contact">
      <form>
        <div><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body)}</p></div>
        <div>
          <label>Name<br /><input name="name" required /></label>
          <label>Email<br /><input name="email" type="email" required /></label>
          <label>Message<br /><textarea name="message" rows="4" required></textarea></label>
          <button type="submit">${escapeHtml(section.buttonLabel)}</button>
        </div>
      </form>
    </section>`;
  }
  const links = section.links.map((link) => `<li>${escapeHtml(link)}</li>`).join("");
  return `<footer class="site-footer">
    <div>
      <strong>${escapeHtml(section.text.replace(/^©\s*/, ""))}</strong>
      <p>${escapeHtml(section.note)}</p>
    </div>
    <ul>${links}</ul>
    <small>${escapeHtml(section.text)}</small>
  </footer>`;
}

export function websiteHtml(title: string, content: WebsiteContent) {
  const theme = content.theme;
  const onPrimary = contrastColor(theme.primary);
  const body = content.sections.map((section) => sectionHtml(section, theme)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${theme.background}; color: ${theme.text}; font-family: ${fontStack(theme.font)}; }
    h1, h2, p { margin: 0; }
    a { color: inherit; }
    .wrap { width: min(72rem, calc(100% - 2.5rem)); margin: 0 auto; }
    .nav { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 1rem; padding: 0.8rem 1.25rem; backdrop-filter: blur(16px); background: color-mix(in srgb, ${theme.background} 72%, transparent); border-bottom: 1px solid color-mix(in srgb, ${theme.text} 12%, transparent); }
    .nav nav { margin-left: auto; display: flex; gap: 1.1rem; color: ${theme.muted}; }
    .nav a { background: ${theme.primary}; color: ${onPrimary}; text-decoration: none; border-radius: 999px; padding: 0.4rem 0.8rem; font-size: 0.8rem; font-weight: 650; }
    .hero, .contact form, .site-footer { width: min(72rem, calc(100% - 2.5rem)); margin: 0 auto; }
    .hero { display: grid; gap: 2.5rem; padding: 4.5rem 0; align-items: center; }
    .eyebrow { display: inline-flex; border-radius: 999px; padding: 0.25rem 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.72rem; background: color-mix(in srgb, ${theme.primary} 14%, ${theme.surface}); color: ${theme.primary}; }
    h1 { margin-top: 1rem; font-size: clamp(2.4rem, 5vw, 4rem); line-height: 1.05; letter-spacing: -0.03em; }
    h2 { font-size: clamp(1.8rem, 3vw, 2.4rem); letter-spacing: -0.03em; }
    .lede { margin-top: 1rem; max-width: 38rem; color: ${theme.muted}; line-height: 1.7; }
    .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; flex-wrap: wrap; }
    .primary, .contact button { background: ${theme.primary}; color: ${onPrimary}; border-radius: 999px; padding: 0.7rem 1.1rem; text-decoration: none; font-weight: 650; border: 0; }
    .secondary { border: 1px solid color-mix(in srgb, ${theme.text} 18%, transparent); border-radius: 999px; padding: 0.7rem 1.1rem; text-decoration: none; font-weight: 650; }
    .hero img, .photo-fallback { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 28px; display: block; }
    .photo-fallback { display: grid; place-items: center; background: linear-gradient(145deg, ${theme.primary}, ${theme.surface}); color: ${onPrimary}; }
    .features, .pricing, .quotes { padding: 4rem 0; }
    .features, .pricing { background: ${theme.surface}; }
    .features ul, .pricing ul { display: grid; gap: 1rem; padding: 0; margin: 1.5rem 0 0; list-style: none; }
    .features li, .pricing li, .quotes .stage { border-radius: 24px; padding: 1.25rem; background: ${theme.background}; border: 1px solid color-mix(in srgb, ${theme.text} 10%, transparent); }
    .icon { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border-radius: 16px; color: ${theme.primary}; background: color-mix(in srgb, ${theme.primary} 16%, ${theme.surface}); }
    .features strong, .pricing strong { display: block; margin-top: 0.8rem; }
    .features p, .pricing span, .quotes span { color: ${theme.muted}; }
    .pricing .featured { background: ${theme.primary}; color: ${onPrimary}; }
    .pricing .featured span { color: ${onPrimary}; }
    .pricing strong { font-size: 2rem; }
    .quotes .stage { background: ${theme.surface}; padding: 2rem; }
    .quotes p { font-size: clamp(1.4rem, 2vw, 2rem); line-height: 1.3; }
    .quotes footer { margin-top: 1.2rem; display: grid; }
    .controls { display: flex; gap: 0.5rem; margin-top: 1rem; }
    .controls button { border-radius: 999px; border: 1px solid color-mix(in srgb, ${theme.text} 16%, transparent); background: transparent; color: inherit; padding: 0.4rem 0.8rem; }
    .contact { padding: 4rem 0; }
    .contact form { display: grid; gap: 1.5rem; background: ${theme.surface}; border-radius: 28px; padding: 2rem; }
    .contact label { display: block; color: ${theme.muted}; font-size: 0.8rem; }
    .contact input, .contact textarea { width: 100%; margin-top: 0.3rem; border-radius: 12px; border: 1px solid color-mix(in srgb, ${theme.text} 12%, transparent); background: ${theme.background}; color: ${theme.text}; padding: 0.7rem; }
    .site-footer { display: grid; gap: 1.5rem; padding: 3rem 0; color: ${theme.background}; }
    body > .site-footer { width: 100%; max-width: none; background: ${theme.text}; padding: 3rem 1.25rem; }
    .site-footer ul { margin: 0; padding: 0; list-style: none; }
    @media (min-width: 800px) {
      .hero, .contact form { grid-template-columns: 1.05fr 0.95fr; }
      .features ul, .pricing ul { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .site-footer { grid-template-columns: 1.4fr 1fr; }
      .nav nav { display: flex; }
    }
    @media (max-width: 799px) { .nav nav { display: none; } }
  </style>
</head>
<body>
${body}
<script>
document.querySelectorAll("[data-slider]").forEach((slider) => {
  const slides = [...slider.querySelectorAll("blockquote")];
  let index = 0;
  const show = (next) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== index; });
  };
  slider.querySelector("[data-prev]")?.addEventListener("click", () => show(index - 1));
  slider.querySelector("[data-next]")?.addEventListener("click", () => show(index + 1));
  setInterval(() => show(index + 1), 5000);
});
</script>
</body>
</html>
`;
}

export function websiteReact(title: string, content: WebsiteContent) {
  return `import { useState } from "react";

const page = ${JSON.stringify({ title, theme: content.theme, sections: content.sections }, null, 2)} as const;

const stacks = {
  sans: "Inter, ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, Times New Roman, serif",
  display: "Palatino Linotype, Palatino, Georgia, serif",
};

export default function LandingPage() {
  const [sent, setSent] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const theme = page.theme;
  return (
    <main style={{ background: theme.background, color: theme.text, fontFamily: stacks[theme.font], margin: 0 }}>
      {page.sections.map((section) => {
        if (section.type === "nav") {
          return (
            <header key={section.id} style={{ position: "sticky", top: 0, display: "flex", gap: 16, alignItems: "center", padding: "12px 20px", backdropFilter: "blur(16px)", background: theme.background }}>
              <strong>{section.brand}</strong>
              <nav style={{ marginLeft: "auto", display: "flex", gap: 16, color: theme.muted }}>{section.links.map((link) => <span key={link}>{link}</span>)}</nav>
              <a href={section.buttonHref || "#contact"} style={{ background: theme.primary, color: "#fff", borderRadius: 999, padding: "6px 12px", textDecoration: "none" }}>{section.buttonLabel}</a>
            </header>
          );
        }
        if (section.type === "hero") {
          return (
            <section key={section.id} style={{ display: "grid", gap: 32, padding: "72px 24px", maxWidth: 1100, margin: "0 auto" }}>
              <div>
                <p style={{ color: theme.primary, letterSpacing: "0.14em", textTransform: "uppercase" }}>{section.eyebrow}</p>
                <h1 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1.05 }}>{section.headline}</h1>
                <p style={{ color: theme.muted, maxWidth: "38rem" }}>{section.subhead}</p>
                <a href={section.buttonHref || "#contact"} style={{ display: "inline-block", marginTop: 24, marginRight: 12, background: theme.primary, color: "#fff", borderRadius: 999, padding: "10px 16px", textDecoration: "none" }}>{section.buttonLabel}</a>
                <a href={section.secondaryHref || "#work"} style={{ display: "inline-block", marginTop: 24, borderRadius: 999, padding: "10px 16px" }}>{section.secondaryLabel}</a>
              </div>
              {section.imageUrl ? <img src={section.imageUrl} alt="" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 28 }} /> : null}
            </section>
          );
        }
        if (section.type === "features") {
          return (
            <section id="work" key={section.id} style={{ background: theme.surface, padding: "64px 24px" }}>
              <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <h2>{section.title}</h2>
                <ul style={{ display: "grid", gap: 16, padding: 0, listStyle: "none" }}>
                  {section.items.map((item) => (
                    <li key={item.title} style={{ background: theme.background, borderRadius: 24, padding: 20 }}>
                      <strong>{item.title}</strong>
                      <p style={{ color: theme.muted }}>{item.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        }
        if (section.type === "testimonials") {
          const quote = section.items[quoteIndex] ?? section.items[0];
          return (
            <section key={section.id} style={{ padding: "64px 24px" }}>
              <div style={{ maxWidth: 1100, margin: "0 auto", background: theme.surface, borderRadius: 28, padding: 32 }}>
                <h2>{section.title}</h2>
                {quote ? <p style={{ fontSize: 28 }}>“{quote.quote}”</p> : null}
                {quote ? <p>{quote.name}<br /><span style={{ color: theme.muted }}>{quote.role}</span></p> : null}
                <button type="button" onClick={() => setQuoteIndex((current) => (current + section.items.length - 1) % section.items.length)}>Previous</button>
                <button type="button" onClick={() => setQuoteIndex((current) => (current + 1) % section.items.length)}>Next</button>
              </div>
            </section>
          );
        }
        if (section.type === "pricing") {
          return (
            <section key={section.id} style={{ background: theme.surface, padding: "64px 24px" }}>
              <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <h2>{section.title}</h2>
                <ul style={{ display: "grid", gap: 16, padding: 0, listStyle: "none" }}>
                  {section.plans.map((plan) => (
                    <li key={plan.name} style={{ background: theme.background, borderRadius: 24, padding: 24 }}>
                      <p>{plan.name}</p>
                      <strong style={{ fontSize: 32 }}>{plan.price}</strong>
                      <p style={{ color: theme.muted }}>{plan.detail}</p>
                      <ul>{plan.points.map((point) => <li key={point}>{point}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        }
        if (section.type === "contact") {
          return (
            <section id="contact" key={section.id} style={{ padding: "64px 24px" }}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSent(true);
                }}
                style={{ maxWidth: 1100, margin: "0 auto", background: theme.surface, borderRadius: 28, padding: 32 }}
              >
                <h2>{section.title}</h2>
                <p style={{ color: theme.muted }}>{section.body}</p>
                <label>Name<br /><input name="name" required style={{ width: "100%", marginTop: 4 }} /></label>
                <label>Email<br /><input name="email" type="email" required style={{ width: "100%", marginTop: 4 }} /></label>
                <label>Message<br /><textarea name="message" required rows={4} style={{ width: "100%", marginTop: 4 }} /></label>
                <button type="submit" style={{ marginTop: 12, background: theme.primary, color: "#fff", border: 0, borderRadius: 999, padding: "10px 16px" }}>{sent ? "Sent" : section.buttonLabel}</button>
              </form>
            </section>
          );
        }
        return (
          <footer key={section.id} style={{ background: theme.text, color: theme.background, padding: 48 }}>
            <strong>{section.text}</strong>
            <p>{section.note}</p>
            <ul>{section.links.map((link) => <li key={link}>{link}</li>)}</ul>
          </footer>
        );
      })}
    </main>
  );
}
`;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStore(files: Array<{ name: string; text: string }>) {
  const encoder = new TextEncoder();
  const entries = files.map((file) => {
    const name = encoder.encode(file.name);
    const bytes = encoder.encode(file.text);
    return { name, bytes, crc: crc32(bytes) };
  });
  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.bytes.length, 0);
  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;
  const locals: number[] = [];
  for (const entry of entries) {
    locals.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.bytes.length, true);
    view.setUint32(offset + 22, entry.bytes.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    out.set(entry.name, offset + 30);
    out.set(entry.bytes, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.bytes.length;
  }
  const centralStart = offset;
  entries.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.bytes.length, true);
    view.setUint32(offset + 24, entry.bytes.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint32(offset + 42, locals[index] ?? 0, true);
    out.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  });
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}

export function websiteExportZip(title: string, content: WebsiteContent) {
  return zipStore([
    { name: "index.html", text: websiteHtml(title, content) },
    { name: "LandingPage.tsx", text: websiteReact(title, content) },
  ]);
}
