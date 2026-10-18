"use client";

import { useEffect, useSyncExternalStore } from "react";
import { IMAGE_STYLES, isImageStyleId, type ImageStyleId } from "@/lib/image-styles";

const OWNER_KEY = "cut45.prefs.owner";
const PREFIX = "cut45.prefs.";

let owner: string | null = null;
let ownerRequest: Promise<string | null> | null = null;
const ownerListeners = new Set<() => void>();

function readOwnerHint() {
  if (owner || typeof window === "undefined") return owner;
  owner = window.localStorage.getItem(OWNER_KEY);
  return owner;
}

function resolveOwner() {
  if (ownerRequest) return ownerRequest;
  ownerRequest = fetch("/api/auth/session")
    .then((response) => response.json())
    .then((payload: { user?: { id?: unknown } | null }) => {
      const id = typeof payload.user?.id === "string" ? payload.user.id : null;
      if (id && id !== owner) {
        owner = id;
        window.localStorage.setItem(OWNER_KEY, id);
        ownerListeners.forEach((listener) => listener());
      }
      return id;
    })
    .catch(() => null);
  return ownerRequest;
}

function createPrefStore<T>(name: string, fallback: T, parse: (value: unknown) => T) {
  const listeners = new Set<() => void>();
  let cachedOwner: string | null | undefined;
  let cached: T = fallback;

  function read(): T {
    const current = readOwnerHint();
    if (current === cachedOwner) return cached;
    cachedOwner = current;
    if (!current) {
      cached = fallback;
      return cached;
    }
    try {
      const raw = window.localStorage.getItem(`${PREFIX}${current}.${name}`);
      cached = raw ? parse(JSON.parse(raw)) : fallback;
    } catch {
      cached = fallback;
    }
    return cached;
  }

  function write(next: T) {
    const current = readOwnerHint();
    cached = next;
    cachedOwner = current;
    if (current) {
      try {
        window.localStorage.setItem(`${PREFIX}${current}.${name}`, JSON.stringify(next));
      } catch {
        // The change still applies for this visit when storage is full.
      }
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    ownerListeners.add(listener);
    return () => {
      listeners.delete(listener);
      ownerListeners.delete(listener);
    };
  }

  function useValue() {
    useEffect(() => {
      void resolveOwner();
    }, []);
    return useSyncExternalStore(subscribe, read, () => fallback);
  }

  return {
    useValue,
    read: () => (typeof window === "undefined" ? fallback : read()),
    set: (update: T | ((current: T) => T)) => {
      const next = typeof update === "function" ? (update as (current: T) => T)(read()) : update;
      write(next);
    },
  };
}

export const PLUGINS = [
  {
    id: "voiceover",
    name: "ElevenLabs Voiceover",
    provider: "ElevenLabs",
    description: "Records character dialogue and lip-syncs it onto every Agent video.",
    connected: true,
  },
  {
    id: "subtitles",
    name: "Auto Subtitles",
    provider: "Cut45",
    description: "Shows caption overlays from the script when a clip plays in the Agent player.",
    connected: true,
  },
  {
    id: "upscaler",
    name: "Fal.ai Crystal Upscaler",
    provider: "Fal.ai",
    description: "Sharpens finished images and frames to a higher resolution.",
    connected: false,
  },
  {
    id: "music",
    name: "Suno Music",
    provider: "Suno",
    description: "Adds a generated soundtrack under each clip.",
    connected: false,
  },
] as const;

export type PluginId = (typeof PLUGINS)[number]["id"];
export type PluginState = Record<PluginId, boolean>;

const DEFAULT_PLUGINS: PluginState = { voiceover: true, subtitles: true, upscaler: false, music: false };

export const pluginStore = createPrefStore<PluginState>("plugins", DEFAULT_PLUGINS, (value) => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    voiceover: typeof record.voiceover === "boolean" ? record.voiceover : DEFAULT_PLUGINS.voiceover,
    subtitles: typeof record.subtitles === "boolean" ? record.subtitles : DEFAULT_PLUGINS.subtitles,
    upscaler: typeof record.upscaler === "boolean" ? record.upscaler : DEFAULT_PLUGINS.upscaler,
    music: typeof record.music === "boolean" ? record.music : DEFAULT_PLUGINS.music,
  };
});

export type BrandKit = {
  name: string;
  logo: string;
  colors: string[];
  style: ImageStyleId | "";
  voice: string;
};

const DEFAULT_BRAND: BrandKit = { name: "", logo: "", colors: ["#7c3aed", "#38bdf8", "#fafafa"], style: "", voice: "" };
const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_DATA = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i;

export const brandStore = createPrefStore<BrandKit>("brand", DEFAULT_BRAND, (value) => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const colors = Array.isArray(record.colors)
    ? record.colors.filter((item): item is string => typeof item === "string" && HEX.test(item)).slice(0, 8)
    : DEFAULT_BRAND.colors;
  return {
    name: typeof record.name === "string" ? record.name.slice(0, 60) : "",
    logo: typeof record.logo === "string" && record.logo.length < 300_000 && IMAGE_DATA.test(record.logo) ? record.logo : "",
    colors,
    style: typeof record.style === "string" && isImageStyleId(record.style) ? record.style : "",
    voice: typeof record.voice === "string" ? record.voice.slice(0, 300) : "",
  };
});

export function brandBrief(brand: BrandKit) {
  const parts = [
    brand.name ? `Brand: ${brand.name}.` : "",
    brand.colors.length > 0 ? `Brand colors: ${brand.colors.join(", ")}.` : "",
    brand.style ? `Preferred visual style: ${IMAGE_STYLES.find((style) => style.id === brand.style)?.name ?? brand.style}.` : "",
    brand.voice ? `Tone: ${brand.voice}` : "",
  ].filter(Boolean);
  return parts.length > 1 || brand.name ? parts.join(" ") : "";
}

export type UploadedAsset = {
  id: string;
  name: string;
  src: string;
  createdAt: string;
};

export const uploadStore = createPrefStore<UploadedAsset[]>("uploads", [], (value) =>
  Array.isArray(value)
    ? value
        .filter(
          (item): item is UploadedAsset =>
            Boolean(item) &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.src === "string" &&
            IMAGE_DATA.test(item.src) &&
            typeof item.createdAt === "string",
        )
        .slice(0, 40)
    : [],
);
