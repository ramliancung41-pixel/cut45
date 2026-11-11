"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedCharacter } from "@/lib/saved-characters";

const PICK_KEY = "cut45-character";

export function CharacterLibrary() {
  const [characters, setCharacters] = useState<SavedCharacter[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/characters")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { characters?: SavedCharacter[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "Could not load characters.");
        setCharacters(payload?.characters ?? []);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not load characters.");
      });
  }, []);

  return (
    <div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {characters.length === 0 && !error ? (
        <p className="text-sm text-muted">No saved characters yet. Images you store land in the characters bucket.</p>
      ) : null}
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {characters.map((character) => (
          <li key={character.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={character.characterImageUrl} alt="" className="aspect-square w-full object-cover" />
            <div className="flex items-center justify-between gap-2 p-3">
              <p className="truncate text-sm font-medium">{character.name}</p>
              <Link
                href="/builder"
                className="shrink-0 text-xs text-white/70 hover:text-white"
                onClick={() => {
                  sessionStorage.setItem(
                    PICK_KEY,
                    JSON.stringify({ name: character.name, url: character.characterImageUrl }),
                  );
                }}
              >
                Use
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
