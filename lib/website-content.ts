export const SECTION_TYPES = ["nav", "hero", "features", "testimonials", "pricing", "contact", "footer"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const FONT_CHOICES = ["sans", "serif", "display"] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

export const FEATURE_ICONS = ["spark", "layers", "bolt", "shield", "chart", "globe"] as const;
export type FeatureIcon = (typeof FEATURE_ICONS)[number];

export type WebsiteTheme = {
  primary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  font: FontChoice;
};

export type NavSection = {
  id: string;
  type: "nav";
  brand: string;
  links: string[];
  buttonLabel: string;
};

export type HeroSection = {
  id: string;
  type: "hero";
  eyebrow: string;
  headline: string;
  subhead: string;
  buttonLabel: string;
  secondaryLabel: string;
  imageUrl: string;
};

export type FeatureItem = { title: string; body: string; icon: FeatureIcon };

export type FeaturesSection = {
  id: string;
  type: "features";
  title: string;
  items: FeatureItem[];
};

export type TestimonialItem = { quote: string; name: string; role: string };

export type TestimonialsSection = {
  id: string;
  type: "testimonials";
  title: string;
  items: TestimonialItem[];
};

export type PricingPlan = { name: string; price: string; detail: string; points: string[] };

export type PricingSection = {
  id: string;
  type: "pricing";
  title: string;
  plans: PricingPlan[];
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
  note: string;
  links: string[];
};

export type WebsiteSection =
  | NavSection
  | HeroSection
  | FeaturesSection
  | TestimonialsSection
  | PricingSection
  | ContactSection
  | FooterSection;

export type WebsiteContent = {
  theme: WebsiteTheme;
  sections: WebsiteSection[];
};

export const SECTION_LABEL: Record<SectionType, string> = {
  nav: "Navbar",
  hero: "Hero",
  features: "Features",
  testimonials: "Testimonials",
  pricing: "Pricing",
  contact: "Contact form",
  footer: "Footer",
};

export const THEME_PRESETS: Array<{ id: string; name: string; theme: WebsiteTheme }> = [
  {
    id: "dark-saas",
    name: "Modern Dark SaaS",
    theme: { primary: "#8b5cf6", background: "#07070b", surface: "#14141c", text: "#f5f5f7", muted: "#a1a1aa", font: "sans" },
  },
  {
    id: "agency-light",
    name: "Clean Agency Light",
    theme: { primary: "#0f172a", background: "#f7f5f2", surface: "#ffffff", text: "#1c1917", muted: "#78716c", font: "sans" },
  },
  {
    id: "minimal-tech",
    name: "Minimalist Tech",
    theme: { primary: "#0ea5e9", background: "#f8fafc", surface: "#ffffff", text: "#0f172a", muted: "#64748b", font: "sans" },
  },
  {
    id: "vibrant",
    name: "Vibrant Creative",
    theme: { primary: "#f97316", background: "#fff7ed", surface: "#ffffff", text: "#1c1917", muted: "#9a3412", font: "display" },
  },
];

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

function iconOf(value: unknown, fallback: FeatureIcon) {
  return FEATURE_ICONS.find((icon) => icon === value) ?? fallback;
}

function trio(value: unknown, fallback: string[], max: number) {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((item, index) => clip(source[index], max) || item);
}

function featureItems(value: unknown, fallback: FeatureItem[]) {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((item, index) => {
    const record = source[index] && typeof source[index] === "object" ? (source[index] as Record<string, unknown>) : {};
    return {
      title: clip(record.title, 60) || item.title,
      body: clip(record.body, 180) || item.body,
      icon: iconOf(record.icon, item.icon),
    };
  });
}

function testimonialItems(value: unknown, fallback: TestimonialItem[]) {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((item, index) => {
    const record = source[index] && typeof source[index] === "object" ? (source[index] as Record<string, unknown>) : {};
    return {
      quote: clip(record.quote, 280) || item.quote,
      name: clip(record.name, 60) || item.name,
      role: clip(record.role, 60) || item.role,
    };
  });
}

function pricingPlans(value: unknown, fallback: PricingPlan[]) {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((plan, index) => {
    const record = source[index] && typeof source[index] === "object" ? (source[index] as Record<string, unknown>) : {};
    return {
      name: clip(record.name, 40) || plan.name,
      price: clip(record.price, 16) || plan.price,
      detail: clip(record.detail, 120) || plan.detail,
      points: trio(record.points, plan.points, 48),
    };
  });
}

export function blankSection(type: SectionType, id: string): WebsiteSection {
  if (type === "nav") {
    return { id, type, brand: "Studio", links: ["Work", "Pricing", "Contact"], buttonLabel: "Book a call" };
  }
  if (type === "hero") {
    return {
      id,
      type,
      eyebrow: "New section",
      headline: "A headline for this page",
      subhead: "Say who it is for and what they should do next.",
      buttonLabel: "Get started",
      secondaryLabel: "See the work",
      imageUrl: "",
    };
  }
  if (type === "features") {
    return {
      id,
      type,
      title: "What you get",
      items: [
        { title: "Clear offer", body: "One sentence a visitor can repeat.", icon: "spark" },
        { title: "Simple sections", body: "Hero, proof, and a way to reach you.", icon: "layers" },
        { title: "Your pictures", body: "Swap in photos from your asset library.", icon: "bolt" },
      ],
    };
  }
  if (type === "testimonials") {
    return {
      id,
      type,
      title: "What people say",
      items: [
        { quote: "The page said exactly what we do.", name: "A customer", role: "Founder" },
        { quote: "We published it the same afternoon.", name: "A founder", role: "Client" },
        { quote: "The layout already looked finished.", name: "A director", role: "Marketing" },
      ],
    };
  }
  if (type === "pricing") {
    return {
      id,
      type,
      title: "Pricing",
      plans: [
        { name: "Starter", price: "$99", detail: "A single landing page.", points: ["One page", "Mobile layout", "Fast hosting"] },
        { name: "Business", price: "$299", detail: "A multi-page studio site.", points: ["Multiple pages", "Custom SEO", "Contact form"] },
        { name: "Custom", price: "$499+", detail: "A Next.js application.", points: ["Custom app", "Tailored design", "Launch support"] },
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
  return {
    id,
    type: "footer",
    text: "© Your studio",
    note: "Design, build, and publish from one studio.",
    links: ["Work", "Pricing", "Contact"],
  };
}

function parseSection(value: unknown, index: number, fallback: WebsiteSection): WebsiteSection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = SECTION_TYPES.find((item) => item === record.type);
  if (!type) return null;
  const id = sectionId(record.id, fallback.id || `section-${index + 1}`);
  if (type === "nav") {
    const base = fallback.type === "nav" ? fallback : (blankSection("nav", id) as NavSection);
    return {
      id,
      type,
      brand: clip(record.brand, 40) || base.brand,
      links: trio(record.links, base.links, 24),
      buttonLabel: clip(record.buttonLabel, 32) || base.buttonLabel,
    };
  }
  if (type === "hero") {
    const base = fallback.type === "hero" ? fallback : (blankSection("hero", id) as HeroSection);
    const imageUrl = clip(record.imageUrl, 500);
    return {
      id,
      type,
      eyebrow: clip(record.eyebrow, 40) || base.eyebrow,
      headline: clip(record.headline, 110) || base.headline,
      subhead: clip(record.subhead, 280) || base.subhead,
      buttonLabel: clip(record.buttonLabel, 32) || base.buttonLabel,
      secondaryLabel: clip(record.secondaryLabel, 32) || base.secondaryLabel,
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
  if (type === "pricing") {
    const base = fallback.type === "pricing" ? fallback : (blankSection("pricing", id) as PricingSection);
    return { id, type, title: clip(record.title, 80) || base.title, plans: pricingPlans(record.plans, base.plans) };
  }
  if (type === "contact") {
    const base = fallback.type === "contact" ? fallback : (blankSection("contact", id) as ContactSection);
    return {
      id,
      type,
      title: clip(record.title, 80) || base.title,
      body: clip(record.body, 280) || base.body,
      buttonLabel: clip(record.buttonLabel, 32) || base.buttonLabel,
    };
  }
  const base = fallback.type === "footer" ? fallback : (blankSection("footer", id) as FooterSection);
  return {
    id,
    type,
    text: clip(record.text, 120) || base.text,
    note: clip(record.note, 160) || base.note,
    links: trio(record.links, base.links, 24),
  };
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
    if (parsed.hostname === "images.unsplash.com") return true;
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

const PHOTO = {
  team: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80",
  office: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80",
  circuit: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
  analytics: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=80",
  workshop: "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1600&q=80",
  earth: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80",
  tower: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
  desk: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80",
} as const;

function preset(id: string) {
  return THEME_PRESETS.find((item) => item.id === id)?.theme ?? THEME_PRESETS[1].theme;
}

function page(theme: WebsiteTheme, sections: WebsiteSection[]): WebsiteContent {
  return { theme, sections };
}

export function templateContent(templateId: string): WebsiteContent {
  if (templateId === "product") {
    return page(preset("dark-saas"), [
      { id: "nav", type: "nav", brand: "Harbor", links: ["Product", "Pricing", "Customers"], buttonLabel: "Start trial" },
      {
        id: "hero",
        type: "hero",
        eyebrow: "Modern Dark SaaS",
        headline: "See the pipeline before the quarter slips.",
        subhead: "Harbor gives revenue teams one live view of deals, risk, and the next call worth making.",
        buttonLabel: "Start trial",
        secondaryLabel: "Watch a tour",
        imageUrl: PHOTO.analytics,
      },
      {
        id: "features",
        type: "features",
        title: "Built for the Monday forecast",
        items: [
          { title: "Live pipeline", body: "Stages, owners, and amounts stay current without a spreadsheet export.", icon: "chart" },
          { title: "Risk in one glance", body: "Stalled deals surface before the weekly review, with the reason attached.", icon: "shield" },
          { title: "Next action", body: "Each account shows the call, note, or follow-up that should happen today.", icon: "bolt" },
        ],
      },
      {
        id: "testimonials",
        type: "testimonials",
        title: "Teams that closed the gap",
        items: [
          { quote: "We stopped rebuilding the forecast in slides. The page is the forecast.", name: "Mina Cho", role: "VP Revenue, Northline" },
          { quote: "Monday reviews dropped from an hour to fifteen minutes.", name: "Chris Adler", role: "Sales lead, Harbor customers" },
          { quote: "The trial page explained the product before anyone booked a demo.", name: "Priya Shah", role: "Founder, Fieldnote" },
        ],
      },
      {
        id: "pricing",
        type: "pricing",
        title: "Start with the plan that matches the team",
        plans: [
          { name: "Starter", price: "$99", detail: "One landing page for the offer.", points: ["Single page", "Mobile layout", "Fast hosting"] },
          { name: "Business", price: "$299", detail: "A multi-page product site.", points: ["Multiple pages", "Custom SEO", "Contact form"] },
          { name: "Custom", price: "$499+", detail: "A full Next.js product app.", points: ["Custom app", "Live data views", "Launch support"] },
        ],
      },
      { id: "contact", type: "contact", title: "Book a working session", body: "Tell us the pipeline you want on screen. We reply within two weekdays.", buttonLabel: "Request a demo" },
      { id: "footer", type: "footer", text: "© Harbor", note: "Revenue software for teams that sell from a live page.", links: ["Product", "Pricing", "Contact"] },
    ]);
  }
  if (templateId === "portfolio") {
    return page(preset("minimal-tech"), [
      { id: "nav", type: "nav", brand: "Lumen", links: ["Work", "Practice", "Contact"], buttonLabel: "Start a project" },
      {
        id: "hero",
        type: "hero",
        eyebrow: "Minimalist Tech",
        headline: "Product design with the noise taken out.",
        subhead: "Lumen builds interfaces for tools people use every day: clear type, quiet color, and a path through the work.",
        buttonLabel: "Start a project",
        secondaryLabel: "See selected work",
        imageUrl: PHOTO.desk,
      },
      {
        id: "features",
        type: "features",
        title: "Selected work",
        items: [
          { title: "Fieldnote", body: "A research app that keeps interviews, tags, and quotes on one calm screen.", icon: "layers" },
          { title: "North Hotel", body: "A booking site that leads with the room, the light, and the rate.", icon: "globe" },
          { title: "Atlas Grid", body: "An operations dashboard that shows exceptions before the full table.", icon: "chart" },
        ],
      },
      {
        id: "testimonials",
        type: "testimonials",
        title: "Clients",
        items: [
          { quote: "The interface felt finished on the first review. We edited words, not structure.", name: "Elena Voss", role: "Product, Fieldnote" },
          { quote: "Guests understood the hotel before they asked for a photo.", name: "Jonah Hale", role: "Owner, North Hotel" },
          { quote: "Our operators stopped hunting through menus.", name: "Amina Reed", role: "Ops, Atlas Grid" },
        ],
      },
      {
        id: "pricing",
        type: "pricing",
        title: "Engagements",
        plans: [
          { name: "Starter", price: "$99", detail: "One focused landing page.", points: ["Single page", "Mobile layout", "Fast hosting"] },
          { name: "Business", price: "$299", detail: "A multi-page practice site.", points: ["Case studies", "Custom SEO", "Contact form"] },
          { name: "Custom", price: "$499+", detail: "A product interface in Next.js.", points: ["Custom app", "Design system", "Launch support"] },
        ],
      },
      { id: "contact", type: "contact", title: "Commission a project", body: "Share the product, the audience, and the date you need a first look.", buttonLabel: "Write Lumen" },
      { id: "footer", type: "footer", text: "© Lumen Notes", note: "Interface design for software and the sites that sell it.", links: ["Work", "Practice", "Contact"] },
    ]);
  }
  if (templateId === "waitlist") {
    return page(preset("vibrant"), [
      { id: "nav", type: "nav", brand: "Sunday", links: ["Issue", "Readers", "Join"], buttonLabel: "Join the list" },
      {
        id: "hero",
        type: "hero",
        eyebrow: "Vibrant Creative",
        headline: "A letter for people who still notice places.",
        subhead: "Sunday sends one story, one kitchen or street, and nothing else. Join before the first issue goes out.",
        buttonLabel: "Join the list",
        secondaryLabel: "Read a sample",
        imageUrl: PHOTO.workshop,
      },
      {
        id: "features",
        type: "features",
        title: "What the first issue holds",
        items: [
          { title: "One letter", body: "A single idea, written like a note and ready to forward.", icon: "spark" },
          { title: "One place", body: "A kitchen, a shop, or a street worth the trip that week.", icon: "globe" },
          { title: "No filler", body: "No ads in the opening issue. Just the thing you asked for.", icon: "shield" },
        ],
      },
      {
        id: "testimonials",
        type: "testimonials",
        title: "Early readers",
        items: [
          { quote: "I forwarded the sample before I finished my coffee.", name: "Elena Park", role: "Reader, first sample" },
          { quote: "It felt published, even as a preview.", name: "Jonah Ellis", role: "Editor, independent" },
          { quote: "The page made the promise obvious. I joined in one step.", name: "Maya Chen", role: "Subscriber" },
        ],
      },
      {
        id: "pricing",
        type: "pricing",
        title: "Ways to launch it",
        plans: [
          { name: "Starter", price: "$99", detail: "The waitlist page, ready to share.", points: ["One page", "Email capture", "Fast hosting"] },
          { name: "Business", price: "$299", detail: "Issue archive and a studio site.", points: ["Multiple pages", "Custom SEO", "Contact form"] },
          { name: "Custom", price: "$499+", detail: "A member app around the letter.", points: ["Custom app", "Member pages", "Launch support"] },
        ],
      },
      { id: "contact", type: "contact", title: "Get the first letter", body: "Leave your email. We write when the first issue is ready.", buttonLabel: "Notify me" },
      { id: "footer", type: "footer", text: "© Sunday Letter", note: "One story a week. No noise around it.", links: ["Issue", "Readers", "Join"] },
    ]);
  }
  return page(preset("agency-light"), [
    { id: "nav", type: "nav", brand: "Northwind", links: ["Work", "Services", "Pricing"], buttonLabel: "Book a call" },
    {
      id: "hero",
      type: "hero",
      eyebrow: "Clean Agency Light",
      headline: "Websites that make the offer obvious.",
      subhead: "Northwind designs, builds, and publishes client sites that explain the work before anyone has to ask.",
      buttonLabel: "Book a call",
      secondaryLabel: "View services",
      imageUrl: PHOTO.office,
    },
    {
      id: "features",
      type: "features",
      title: "How a project moves",
      items: [
        { title: "Offer first", body: "We write the headline in the client's words, then build the page around it.", icon: "spark" },
        { title: "Proof on the page", body: "Three reasons, a client quote, and a price a visitor can compare.", icon: "layers" },
        { title: "Published, not parked", body: "The site goes live on its address, with a domain when the client is ready.", icon: "globe" },
      ],
    },
    {
      id: "testimonials",
      type: "testimonials",
      title: "From recent clients",
      items: [
        { quote: "People understand the studio before they call. The page does the introduction.", name: "Ava Lane", role: "Founder, Lane & Co." },
        { quote: "We changed the headline twice and saw it on the live preview immediately.", name: "Noah Park", role: "Director, Park Studio" },
        { quote: "It looked like a finished agency site on day one, not a wireframe.", name: "Sofia Mendes", role: "Marketing, Harbor" },
      ],
    },
    {
      id: "pricing",
      type: "pricing",
      title: "Packages",
      plans: [
        { name: "Starter", price: "$99", detail: "A single landing page, ready to share.", points: ["One page", "Mobile layout", "Fast hosting"] },
        { name: "Business", price: "$299", detail: "A multi-page site with search and a form.", points: ["Multiple pages", "Custom SEO", "Contact form"] },
        { name: "Custom", price: "$499+", detail: "A Next.js app shaped around the product.", points: ["Custom app", "Tailored design", "Launch support"] },
      ],
    },
    { id: "contact", type: "contact", title: "Start a project", body: "Tell us what the site needs to do. We reply within two weekdays.", buttonLabel: "Send the brief" },
    { id: "footer", type: "footer", text: "© Northwind Studio", note: "Agency sites, designed and published from one studio.", links: ["Work", "Services", "Pricing"] },
  ]);
}

export function templateTitle(templateId: string) {
  if (templateId === "product") return "Harbor";
  if (templateId === "portfolio") return "Lumen Notes";
  if (templateId === "waitlist") return "Sunday Letter";
  return "Northwind Studio";
}
