"use client";

import { StudioPageHeader, Switch } from "@/components/studio-page";
import { PLUGINS, pluginStore } from "@/lib/studio-prefs";

const ICON_TINT: Record<string, string> = {
  voiceover: "bg-violet-400/15 text-violet-200",
  subtitles: "bg-sky-400/15 text-sky-200",
  upscaler: "bg-emerald-400/15 text-emerald-200",
  music: "bg-pink-400/15 text-pink-200",
};

function PluginIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {id === "voiceover" ? <path d="M4 8v4M7 5.5v9M10 3.5v13M13 6v8M16 8.5v3" /> : null}
      {id === "subtitles" ? (
        <>
          <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
          <path d="M6 11.5h3M11 11.5h3M6 8.5h8" />
        </>
      ) : null}
      {id === "upscaler" ? <path d="M4 16 16 4M10 4h6v6M4 10v6h6" /> : null}
      {id === "music" ? (
        <>
          <path d="M8 14.5V5l8-1.5V13" />
          <circle cx="6" cy="14.5" r="2" />
          <circle cx="14" cy="13" r="2" />
        </>
      ) : null}
    </svg>
  );
}

export function PluginsBoard() {
  const state = pluginStore.useValue();
  const enabled = PLUGINS.filter((plugin) => state[plugin.id]).length;

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Plugins"
        title="Integrated AI tools"
        description="Switch tools on or off for your account. Connected plugins change how the Agent renders right away."
        action={
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-300 tabular-nums">
            {enabled} of {PLUGINS.length} on
          </span>
        }
      />
      <ul className="grid gap-3">
        {PLUGINS.map((plugin) => {
          const on = state[plugin.id];
          return (
            <li key={plugin.id} className="agent-glass flex items-center gap-4 rounded-2xl p-4 sm:p-5">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${ICON_TINT[plugin.id]}`}>
                <PluginIcon id={plugin.id} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-white">{plugin.name}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                      plugin.connected ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-zinc-400"
                    }`}
                  >
                    {plugin.connected ? "Connected" : "Not connected yet"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{plugin.description}</p>
                {!plugin.connected ? (
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                    Your choice is saved now and takes effect once {plugin.provider} is wired into rendering.
                  </p>
                ) : null}
              </div>
              <Switch
                checked={on}
                label={`${on ? "Turn off" : "Turn on"} ${plugin.name}`}
                onChange={(next) => pluginStore.set((current) => ({ ...current, [plugin.id]: next }))}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
