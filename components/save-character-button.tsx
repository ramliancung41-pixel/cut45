"use client";

import { useState } from "react";

export function SaveCharacterButton({
  imageUrl,
  label = "Save to Character",
  className = "gen-ghost",
}: {
  imageUrl?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const characterName = name.trim();
    if (!characterName || saving) return;
    setSaving(true);
    setError("");
    try {
      const tempFalUrl = imageUrl && !/\.mp4($|\?)/i.test(imageUrl) ? imageUrl : "";
      if (!tempFalUrl) throw new Error("There is no character image to save.");
      const response = await fetch("/api/characters/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterName, tempFalUrl }),
      });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error ?? "The character could not be saved.");
      setOpen(false);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The character could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4" role="dialog" aria-modal="true">
          <form
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111113] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h2 className="text-base font-semibold text-white">Save to Character</h2>
            <p className="mt-1 text-sm text-white/60">Name this character, for example KAITO.</p>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="KAITO"
              className="mt-4 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
            />
            {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="gen-ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="gen-cta" disabled={saving || name.trim().length < 1}>
                {saving ? "Saving…" : "Save character"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
