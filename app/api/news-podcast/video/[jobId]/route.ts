import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(jobId)) return new Response("Not found", { status: 404 });
  const file = path.join(os.tmpdir(), `podcast-${jobId}`, "final.mp4");
  let size = 0;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": 'inline; filename="cut45-news.mp4"',
      "Cache-Control": "no-store",
    },
  });
}
