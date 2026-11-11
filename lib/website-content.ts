export const SECTION_TYPES = ["hero", "features", "testimonials", "contact", "footer"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const FONT_CHOICES = ["sans", "serif", "display"] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

export type WebsiteTheme = {
  primary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  font: FontChoice;
};

export type HeroSection = {
  id: string;
  type: "hero";
  eyebrow: string;
  headline: string;
  subhead: string;
  buttonLabel: string;
  imageUrl: string;
};

export type FeatureItem = { title: string; body: string };

export type FeaturesSection = {
  id: string;
  type: "features";
  title: string;
  items: FeatureItem[];
};

export type TestimonialItem = { quote: string; name: string };

export type TestimonialsSection = {
  id: string;
  type: "testimonials";
  title: string;
  items: TestimonialItem[];
};

export type ContactSection = {
  id: string;
  type: "contact";
  title: string;
  body: string;
  buttonLabel: string;
};

export type FooterSection = {
  id: string;
  type: "footer";
  text: string;
};

export type WebsiteSection = HeroSection | FeaturesSection | TestimonialsSection | ContactSection | FooterSection;

export type WebsiteContent = {
  theme: WebsiteTheme;
  sections: WebsiteSection[];
};

export const SECTION_LABEL: Record<SectionType, string> = {
  hero: "Hero",
  features: "Features",
  testimonials: "Testimonials",
  contact: "Contact form",
  footer: "Footer",
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SECTION_ID = /^[a-z0-9_-]{2,40}$/i;

export function fontStack(font: FontChoice) {
  if (font === "serif") return 'Georgia, "Iowan Old Style", "Times New Roman", serif';
  if (font === "display") return '"Palatino Linotype", Palatino, Georgia, serif';
  return 'var(--font-studio), Inter, ui-sans-serif, system-ui, sans-serif';
}

export function contrastColor(hex: string) {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const red = Number.parseInt(full.slice(1, 3), 16);
  const green = Number.parseInt(full.slice(3, 5), 16);
  const blue = Number.parseInt(full.slice(5, 7), 16);
  if (![red, green, blue].every((channel) => Number.isFinite(channel))) return "#ffffff";
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "site";
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function color(value: unknown, fallback: string) {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function sectionId(value: unknown, fallback: string) {
  return typeof value === "string" && SECTION_ID.test(value) ? value : fallback;
}

const LIGHT: WebsiteTheme = {
  primary: "#111111",
  background: "#f6f3ee",
  surface: "#ffffff",
  text: "#1c1917",
  muted: "#78716c",
  font: "sans",
};

function themeFrom(value: unknown, fallback: WebsiteTheme): WebsiteTheme {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const font = FONT_CHOICES.find((choice) => choice === record.font) ?? fallback.font;
  return {
    primary: color(record.primary, fallback.primary),
    background: color(record.background, fallback.background),
    surface: color(record.surface, fallback.surface),
    text: color(record.text, fallback.text),
    muted: color(record.muted, fallback.muted),
    font,
  };
}

function featureItems(value: unknown, fallback: FeatureItem[]) {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((item, index) => {
    const record = source[index] && typeof source[index] === "object" ? (source[index] as Record<string, unknown>) : {};
    return {
      title: clip(record.title, 60) || item.title,
      body: clip(record.body, 180) || item.body,
    };
  });
}

function testimonialItems(value: unknown, fallback: TestimonialItem[]) {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((item, index) => {
    const record = source[index] && typeof source[index] === "object" ? (source[index] as Record<string, unknown>) : {};
    return {
      quote: clip(record.quote, 220) || item.quote,
      name: clip(record.name, 60) || item.name,
    };
  });
}

export function blankSection(type: SectionType, id: string): WebsiteSection {
  if (type === "hero") {
    return {
      id,
      type,
      eyebrow: "New section",
      headline: "A headline for this page",
      subhead: "Say who it is for and what they should do next.",
      buttonLabel: "Get started",
      imageUrl: "",
    };
  }
  if (type === "features") {
    return {
      id,
      type,
      title: "What you get",
      items: [
        { title: "Clear offer", body: "One sentence a visitor can repeat." },
        { title: "Simple sections", body: "Hero, proof, and a way to reach you." },
        { title: "Your pictures", body: "Swap in photos from your asset library." },
      ],
    };
  }
  if (type === "testimonials") {
    return {
      id,
      type,
      title: "What people say",
      items: [
        { quote: "The page said exactly what we do.", name: "A customer" },
        { quote: "We published it the same afternoon.", name: "A founder" },
      ],
    };
  }
  if (type === "contact") {
    return {
      id,
      type,
      title: "Talk to us",
      body: "Leave a note and we will reply.",
      buttonLabel: "Send",
    };
  }
  return { id, type: "footer", text: "© Your studio" };
}

function parseSection(value: unknown, index: number, fallback: WebsiteSection): WebsiteSection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = SECTION_TYPES.find((item) => item === record.type);
  if (!type) return null;
  const id = sectionId(record.id, fallback.id || `section-${index + 1}`);
  if (type === "hero") {
    const base = fallback.type === "hero" ? fallback : (blankSection("hero", id) as HeroSection);
    const imageUrl = clip(record.imageUrl, 500);
    return {
      id,
      type,
      eyebrow: clip(record.eyebrow, 40) || base.eyebrow,
      headline: clip(record.headline, 90) || base.headline,
      subhead: clip(record.subhead, 220) || base.subhead,
      buttonLabel: clip(record.buttonLabel, 32) || base.buttonLabel,
      imageUrl: imageUrl.startsWith("https://") ? imageUrl : "",
    };
  }
  if (type === "features") {
    const base = fallback.type === "features" ? fallback : (blankSection("features", id) as FeaturesSection);
    return { id, type, title: clip(record.title, 80) || base.title, items: featureItems(record.items, base.items) };
  }
  if (type === "testimonials") {
    const base = fallback.type === "testimonials" ? fallback : (blankSection("testimonials", id) as TestimonialsSection);
    return { id, type, title: clip(record.title, 80) || base.title, items: testimonialItems(record.items, base.items) };
  }
  if (type === "contact") {
    const base = fallback.type === "contact" ? fallback : (blankSection("contact", id) as ContactSection);
    return {
      id,
      type,
      title: clip(record.title, 80) || base.title,
      body: clip(record.body, 220) || base.body,
      buttonLabel: clip(record.buttonLabel, 32) || base.buttonLabel,
    };
  }
  const base = fallback.type === "footer" ? fallback : (blankSection("footer", id) as FooterSection);
  return { id, type, text: clip(record.text, 120) || base.text };
}

export function parseWebsiteContent(value: unknown, fallback: WebsiteContent): WebsiteContent {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const source = Array.isArray(record.sections) ? record.sections.slice(0, 12) : fallback.sections;
  const sections = source
    .map((item, index) => parseSection(item, index, fallback.sections[index] ?? blankSection("hero", `section-${index + 1}`)))
    .filter((item): item is WebsiteSection => Boolean(item));
  const seen = new Set<string>();
  const unique = sections.filter((section) => {
    if (seen.has(section.id)) return false;
    seen.add(section.id);
    return true;
  });
  return {
    theme: themeFrom(record.theme, fallback.theme),
    sections: unique.length > 0 ? unique : fallback.sections,
  };
}

export function isStoredImageUrl(url: string) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (parsed.protocol !== "https:") return false;
    if (!base) return parsed.hostname.endsWith(".supabase.co");
    const host = new URL(base).hostname;
    return parsed.hostname === host || parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function sanitizeWebsiteContent(value: unknown, fallback: WebsiteContent): WebsiteContent | null {
  const content = parseWebsiteContent(value, fallback);
  for (const section of content.sections) {
    if (section.type === "hero" && !isStoredImageUrl(section.imageUrl)) return null;
  }
  return content;
}

function page(theme: WebsiteTheme, sections: WebsiteSection[]): WebsiteContent {
  return { theme, sections };
}

export function templateContent(templateId: string): WebsiteContent {
  if (templateId === "product") {
    return page(
      { ...LIGHT, primary: "#0f3d32", background: "#f3f7f4", muted: "#5f6f68" },
      [
        {
          id: "hero",
          type: "hero",
          eyebrow: "Now shipping",
          headline: "A product people understand in one glance.",
          subhead: "Show the thing, the price, and the reason to buy it today.",
          buttonLabel: "Shop the launch",
          imageUrl: "",
        },
        {
          id: "features",
          type: "features",
          title: "Why it earns a place",
          items: [
            { title: "Made to last", body: "Materials and a finish you can describe in one line." },
            { title: "Ready to use", body: "No setup story. It does the job on the first day." },
            { title: "A fair price", body: "Put the number next to the benefit, not in a footnote." },
          ],
        },
        {
          id: "testimonials",
          type: "testimonials",
          title: "From people who bought it",
          items: [
            { quote: "I knew what I was getting before I checked out.", name: "Mina K." },
            { quote: "The page made the decision easy.", name: "Chris A." },
          ],
        },
        {
          id: "contact",
          type: "contact",
          title: "Ask about an order",
          body: "Questions about shipping or a wholesale note can go here.",
          buttonLabel: "Send a note",
        },
        { id: "footer", type: "footer", text: "© Harbor Goods" },
      ],
    );
  }
  if (templateId === "portfolio") {
    return page(
      { ...LIGHT, primary: "#3f2a1d", background: "#f7f1ea", muted: "#7c6a5d" },
      [
        {
          id: "hero",
          type: "hero",
          eyebrow: "Selected work",
          headline: "A quiet portfolio for work that should be seen.",
          subhead: "Lead with the practice, then three pieces, then a way to write.",
          buttonLabel: "Start a project",
          imageUrl: "",
        },
        {
          id: "features",
          type: "features",
          title: "Recent pieces",
          items: [
            { title: "Coast road", body: "A series about small towns at the edge of the water." },
            { title: "Studio light", body: "Portraits with one window and no extra props." },
            { title: "Night market", body: "Color, steam, and the people who stay late." },
          ],
        },
        {
          id: "testimonials",
          type: "testimonials",
          title: "Clients",
          items: [
            { quote: "The pictures felt like the place, not a brochure.", name: "North Hotel" },
            { quote: "Clear, calm, and finished on time.", name: "Lumen Press" },
          ],
        },
        {
          id: "contact",
          type: "contact",
          title: "Commission a story",
          body: "Tell me the place, the dates, and what the pictures need to do.",
          buttonLabel: "Write",
        },
        { id: "footer", type: "footer", text: "© Lumen Notes" },
      ],
    );
  }
  if (templateId === "waitlist") {
    return page(
      { ...LIGHT, primary: "#1e1b4b", background: "#f5f4fb", muted: "#6b6780" },
      [
        {
          id: "hero",
          type: "hero",
          eyebrow: "Opening soon",
          headline: "Join the list before the doors open.",
          subhead: "One promise, one proof, and a place to leave an email.",
          buttonLabel: "Join the list",
          imageUrl: "",
        },
        {
          id: "features",
          type: "features",
          title: "What the first issue covers",
          items: [
            { title: "A short letter", body: "One useful idea, written like a note to a friend." },
            { title: "A place", body: "A kitchen, a shop, or a street worth the trip." },
            { title: "No noise", body: "No ads in the first letter. Just the thing you signed up for." },
          ],
        },
        {
          id: "testimonials",
          type: "testimonials",
          title: "Early readers",
          items: [
            { quote: "I forwarded the sample to my sister.", name: "Elena" },
            { quote: "It felt finished, even as a preview.", name: "Jonah" },
          ],
        },
        {
          id: "contact",
          type: "contact",
          title: "Get the first letter",
          body: "Leave your email. We will write when the first issue is ready.",
          buttonLabel: "Notify me",
        },
        { id: "footer", type: "footer", text: "© Sunday Letter" },
      ],
    );
  }
  return page(LIGHT, [
    {
      id: "hero",
      type: "hero",
      eyebrow: "Studio",
      headline: "A landing page that says what you do.",
      subhead: "Start with a clear offer, three reasons to stay, and a way to get in touch.",
      buttonLabel: "Book a call",
      imageUrl: "",
    },
    {
      id: "features",
      type: "features",
      title: "How the work goes",
      items: [
        { title: "Listen first", body: "We write the offer in your words, not a template's." },
        { title: "Design the page", body: "Hero, proof, and a contact form that matches the brand." },
        { title: "Publish it", body: "Save the site to your account and keep editing the copy." },
      ],
    },
    {
      id: "testimonials",
      type: "testimonials",
      title: "From recent clients",
      items: [
        { quote: "People finally understand the studio before they call.", name: "Ava Lane" },
        { quote: "We changed the headline twice and saw it immediately.", name: "Noah Park" },
      ],
    },
    {
      id: "contact",
      type: "contact",
      title: "Start a project",
      body: "Tell us what the page needs to do. We reply within two weekdays.",
      buttonLabel: "Send",
    },
    { id: "footer", type: "footer", text: "© Northwind Studio" },
  ]);
}

export function templateTitle(templateId: string) {
  if (templateId === "product") return "Harbor Goods";
  if (templateId === "portfolio") return "Lumen Notes";
  if (templateId === "waitlist") return "Sunday Letter";
  return "Northwind Studio";
}
