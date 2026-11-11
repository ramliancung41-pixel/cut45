import Link from "next/link";
import { AGENCY_PACKAGES } from "@/lib/agency";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const COMPARISON = [
  { feature: "Single landing page", starter: true, business: true, custom: true },
  { feature: "Mobile responsive", starter: true, business: true, custom: true },
  { feature: "Fast hosting", starter: true, business: true, custom: true },
  { feature: "Multi-page website", starter: false, business: true, custom: true },
  { feature: "Custom SEO", starter: false, business: true, custom: true },
  { feature: "Contact form", starter: false, business: true, custom: true },
  { feature: "Full custom Next.js app", starter: false, business: false, custom: true },
] as const;

const FAQ = [
  {
    question: "What is included in the Starter Web Package?",
    answer: "One landing page, a mobile layout, and fast hosting. It is the package for a single offer.",
  },
  {
    question: "How is Business Studio different?",
    answer: "It covers a multi-page website, custom SEO, and a contact form so visitors can write to you.",
  },
  {
    question: "When should I choose the Custom AI Web App?",
    answer: "Choose it when the site needs a full custom Next.js application, starting at $499.",
  },
  {
    question: "How do I ask the agency to build it?",
    answer: "Open the agency page and send a request with your name, email, and what the site should do.",
  },
] as const;

function Mark({ included }: { included: boolean }) {
  return <span className={included ? "text-white" : "text-white/25"}>{included ? "Yes" : "—"}</span>;
}

export function PricingPackages() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <SiteHeader active="pricing" />
      <main className="mx-auto w-full max-w-6xl px-3 py-12 sm:px-6 sm:py-16">
        <p className="text-xs tracking-[0.18em] text-white/50 uppercase">Pricing</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight text-balance sm:text-5xl">
          Three packages for client websites.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">
          Compare what each package includes. To have the agency build one, send a request from the agency page.
        </p>

        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {AGENCY_PACKAGES.map((item) => (
            <li key={item.id} className="rounded-3xl border border-white/15 bg-white/[0.03] p-5">
              <p className="text-sm text-white/60">{item.price}</p>
              <h2 className="mt-2 text-xl font-medium">{item.name}</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">{item.detail}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <section className="mt-14" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading" className="text-2xl font-medium">
            Feature comparison
          </h2>
          <div className="mt-4 overflow-x-auto rounded-3xl border border-white/15">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-white/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Feature</th>
                  <th className="px-4 py-3 font-medium">Starter $99</th>
                  <th className="px-4 py-3 font-medium">Business $299</th>
                  <th className="px-4 py-3 font-medium">Custom $499+</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-t border-white/10">
                    <th className="px-4 py-3 font-medium">{row.feature}</th>
                    <td className="px-4 py-3"><Mark included={row.starter} /></td>
                    <td className="px-4 py-3"><Mark included={row.business} /></td>
                    <td className="px-4 py-3"><Mark included={row.custom} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14 max-w-3xl" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-2xl font-medium">
            FAQ
          </h2>
          <div className="mt-4 divide-y divide-white/10 rounded-3xl border border-white/15">
            {FAQ.map((item) => (
              <details key={item.question} className="px-5 py-4">
                <summary className="cursor-pointer text-sm font-medium">{item.question}</summary>
                <p className="mt-2 text-sm leading-6 text-white/60">{item.answer}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-white/50">
            Ready for the agency to build it?{" "}
            <Link href="/agency" className="text-white underline decoration-white/30 underline-offset-4">
              Request a website
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
