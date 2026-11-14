export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Speaker = "A" | "B";
type Clip = { speaker: Speaker; audioDataUrl: string; durationSec: number; imageIndex: number };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { jobId?: unknown; clips?: unknown } | null;
  const clips = parseClips(body?.clips);
  const jobId = typeof body?.jobId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(body.jobId) ? body.jobId : crypto.randomUUID();
  if (!clips) return Response.json({ error: "Send the dialogue audio clips." }, { status: 400 });
  return Response.json({
    jobId,
    videos: clips.map((clip) => ({
      speaker: clip.speaker,
      audioDataUrl: clip.audioDataUrl,
      durationSec: clip.durationSec,
      imageIndex: clip.imageIndex,
    })),
  });
}

function parseClips(value: unknown): Clip[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 14) return null;
  const clips: Clip[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as { speaker?: unknown; audioDataUrl?: unknown; durationSec?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const audioDataUrl = typeof record.audioDataUrl === "string" && record.audioDataUrl.startsWith("data:audio/") ? record.audioDataUrl : "";
    const durationSec = typeof record.durationSec === "number" && record.durationSec > 0 ? Math.min(record.durationSec, 30) : 0;
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(2, Math.floor(record.imageIndex)) : 0;
    if (!speaker || !audioDataUrl || !durationSec) return null;
    clips.push({ speaker, audioDataUrl, durationSec, imageIndex });
  }
  return clips;
}
