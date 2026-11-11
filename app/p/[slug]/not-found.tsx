import Link from "next/link";

export default function UnpublishedSite() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#09090b] px-6 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">This page is not published</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          The public address opens after the site is published from the builder.
        </p>
        <Link href="/agency" className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-black">
          Agency services
        </Link>
      </div>
    </main>
  );
}
