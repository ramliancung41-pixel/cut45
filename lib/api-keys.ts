const KEYS = ["FAL_KEY", "ELEVENLABS_API_KEY", "GEMINI_API_KEY"] as const;

export type ApiKeyName = (typeof KEYS)[number];

export function readApiKey(name: ApiKeyName) {
  if (name === "FAL_KEY") {
    return process.env.FAL_KEY?.trim() || process.env.FAL_AI_API_KEY?.trim() || "";
  }
  return process.env[name]?.trim() || "";
}

export function logApiKey(name: ApiKeyName) {
  const present = readApiKey(name).length > 0;
  if (present) console.info(`[env] ${name} present`);
  else console.error(`[env] ${name} missing`);
  return present;
}
