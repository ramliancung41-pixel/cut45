export function falApiKey() {
  return process.env.FAL_KEY?.trim() || process.env.FAL_AI_API_KEY?.trim() || "";
}
