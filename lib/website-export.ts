import { contrastColor, fontStack, type WebsiteContent, type WebsiteSection } from "@/lib/website-content";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImage(url: string) {
  if (!/^https:\/\/[^\s"'<>]+$/.test(url)) return "";
  return escapeHtml(url);
}

function sectionHtml(section: WebsiteSection, theme: WebsiteContent["theme"]) {
  const onPrimary = contrastColor(theme.primary);
  if (section.type === "hero") {
    const image = safeImage(section.imageUrl);
    const media = image
      ? `<img src="${image}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:24px" />`
      : `<div style="aspect-ratio:4/3;border-radius:24px;display:grid;place-items:center;background:linear-gradient(145deg,${theme.primary},${theme.background});color:${onPrimary}">Section image</div>`;
    return `<section class="hero" style="display:grid;gap:32px;padding:64px 24px">
      <div>
        <p style="letter-spacing:.18em;text-transform:uppercase;color:${theme.muted};font-size:12px">${escapeHtml(section.eyebrow)}</p>
        <h1 style="font-size:48px;line-height:1.1;margin:12px 0 0">${escapeHtml(section.headline)}</h1>
        <p style="max-width:36rem;color:${theme.muted};font-size:16px;line-height:1.7">${escapeHtml(section.subhead)}</p>
        <a href="#contact" style="display:inline-block;margin-top:24px;background:${theme.primary};color:${onPrimary};border-radius:999px;padding:10px 16px;text-decoration:none;font-weight:600">${escapeHtml(section.buttonLabel)}</a>
      </div>
      ${media}
    </section>`;
  }
  if (section.type === "features") {
    const items = section.items
      .map(
        (item) => `<li style="background:${theme.background};border-radius:16px;padding:16px">
          <strong>${escapeHtml(item.title)}</strong>
          <p style="color:${theme.muted}">${escapeHtml(item.body)}</p>
        </li>`,
      )
      .join("");
    return `<section class="features" style="background:${theme.surface};padding:48px 24px">
      <h2>${escapeHtml(section.title)}</h2>
      <ul style="display:grid;gap:16px;padding:0;list-style:none">${items}</ul>
    </section>`;
  }
  if (section.type === "testimonials") {
    const items = section.items
      .map(
        (item) => `<li style="background:${theme.surface};border-radius:16px;padding:20px">
          <p>“${escapeHtml(item.quote)}”</p>
          <p style="color:${theme.muted}">${escapeHtml(item.name)}</p>
        </li>`,
      )
      .join("");
    return `<section style="padding:48px 24px"><h2>${escapeHtml(section.title)}</h2><ul style="display:grid;gap:16px;padding:0;list-style:none">${items}</ul></section>`;
  }
  if (section.type === "contact") {
    return `<section id="contact" style="padding:48px 24px">
      <form style="max-width:36rem;margin:0 auto;background:${theme.surface};border-radius:24px;padding:24px">
        <h2>${escapeHtml(section.title)}</h2>
        <p style="color:${theme.muted}">${escapeHtml(section.body)}</p>
        <label>Name<br /><input name="name" style="width:100%;margin-top:4px;padding:10px;border-radius:12px;border:1px solid ${theme.muted}" /></label>
        <label>Email<br /><input name="email" type="email" style="width:100%;margin-top:4px;padding:10px;border-radius:12px;border:1px solid ${theme.muted}" /></label>
        <label>Message<br /><textarea name="message" rows="4" style="width:100%;margin-top:4px;padding:10px;border-radius:12px;border:1px solid ${theme.muted}"></textarea></label>
        <button type="submit" style="margin-top:12px;background:${theme.primary};color:${onPrimary};border:0;border-radius:999px;padding:10px 16px;font-weight:600">${escapeHtml(section.buttonLabel)}</button>
      </form>
    </section>`;
  }
  return `<footer style="padding:32px 24px;text-align:center;color:${theme.muted}">${escapeHtml(section.text)}</footer>`;
}

export function websiteHtml(title: string, content: WebsiteContent) {
  const theme = content.theme;
  const body = content.sections.map((section) => sectionHtml(section, theme)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; background: ${theme.background}; color: ${theme.text}; font-family: ${fontStack(theme.font)}; }
    h1, h2, p { margin: 0; }
    h2 { font-size: 28px; }
    section + section { margin-top: 0; }
    @media (min-width: 800px) {
      .hero { grid-template-columns: 1.1fr .9fr; align-items: center; padding: 80px 40px; }
      .features ul { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
${body}
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
  const theme = page.theme;
  return (
    <main style={{ background: theme.background, color: theme.text, fontFamily: stacks[theme.font], margin: 0 }}>
      {page.sections.map((section) => {
        if (section.type === "hero") {
          return (
            <section key={section.id} style={{ display: "grid", gap: 32, padding: "64px 24px" }}>
              <div>
                <p style={{ color: theme.muted, letterSpacing: "0.18em", textTransform: "uppercase" }}>{section.eyebrow}</p>
                <h1 style={{ fontSize: 48, lineHeight: 1.1 }}>{section.headline}</h1>
                <p style={{ color: theme.muted, maxWidth: "36rem" }}>{section.subhead}</p>
                <a href="#contact" style={{ display: "inline-block", marginTop: 24, background: theme.primary, color: "#fff", borderRadius: 999, padding: "10px 16px", textDecoration: "none" }}>{section.buttonLabel}</a>
              </div>
              {section.imageUrl ? <img src={section.imageUrl} alt="" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 24 }} /> : null}
            </section>
          );
        }
        if (section.type === "features") {
          return (
            <section key={section.id} style={{ background: theme.surface, padding: "48px 24px" }}>
              <h2>{section.title}</h2>
              <ul style={{ display: "grid", gap: 16, padding: 0, listStyle: "none" }}>
                {section.items.map((item) => (
                  <li key={item.title} style={{ background: theme.background, borderRadius: 16, padding: 16 }}>
                    <strong>{item.title}</strong>
                    <p style={{ color: theme.muted }}>{item.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        if (section.type === "testimonials") {
          return (
            <section key={section.id} style={{ padding: "48px 24px" }}>
              <h2>{section.title}</h2>
              <ul style={{ display: "grid", gap: 16, padding: 0, listStyle: "none" }}>
                {section.items.map((item) => (
                  <li key={item.name} style={{ background: theme.surface, borderRadius: 16, padding: 20 }}>
                    <p>“{item.quote}”</p>
                    <p style={{ color: theme.muted }}>{item.name}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        if (section.type === "contact") {
          return (
            <section id="contact" key={section.id} style={{ padding: "48px 24px" }}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSent(true);
                }}
                style={{ maxWidth: "36rem", margin: "0 auto", background: theme.surface, borderRadius: 24, padding: 24 }}
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
        return <footer key={section.id} style={{ padding: 32, textAlign: "center", color: theme.muted }}>{section.text}</footer>;
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
