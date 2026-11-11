export type ReferenceImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
};

const MAX_IMAGE_BYTES = 3_500_000;

export function parseReferenceImage(value: unknown): ReferenceImage | null | "invalid" {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) return "invalid";
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return "invalid";
  const type = match[1].toLowerCase();
  const contentType = type === "image/png" || type === "image/webp" ? type : "image/jpeg";
  return { contentType, bytes };
}

function issuedFileUrl(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function uploadReference(
  key: string,
  image: ReferenceImage,
  signal: AbortSignal,
): Promise<{ fileUrl: string } | { error: string }> {
  const extension = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
  let initiated: Response;
  try {
    initiated = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        file_name: `reference.${extension}`,
        content_type: image.contentType,
      }),
      signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fal storage could not be reached.";
    return { error: message };
  }
  if (!initiated.ok) {
    return { error: await falResponseError(initiated) };
  }
  const payload = (await initiated.json()) as {
    upload_url?: unknown;
    file_url?: unknown;
    fileUrl?: unknown;
    access_url?: unknown;
  };
  const uploadUrl = typeof payload.upload_url === "string" ? payload.upload_url : "";
  const fileUrl =
    issuedFileUrl(payload.file_url) ?? issuedFileUrl(payload.fileUrl) ?? issuedFileUrl(payload.access_url);
  if (!uploadUrl.startsWith("https://") || !fileUrl) {
    return { error: "Fal storage did not return an upload URL." };
  }
  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": image.contentType },
    body: new Uint8Array(image.bytes),
    signal,
  });
  if (!uploaded.ok) {
    return { error: await falResponseError(uploaded) };
  }
  return { fileUrl };
}

export async function falResponseError(response: Response) {
  const text = await response.text().catch(() => "");
  const detail = falErrorDetail(text);
  return detail || `Fal.ai returned ${response.status}.`;
}

export function falErrorDetail(value: unknown) {
  const parsed = typeof value === "string" ? safeJson(value) ?? value : value;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    return trimmed ? trimmed.slice(0, 500) : "";
  }
  if (!parsed || typeof parsed !== "object") return "";
  const record = parsed as {
    detail?: unknown;
    error?: unknown;
    message?: unknown;
    payload?: { detail?: unknown };
  };
  const detail = record.detail ?? record.payload?.detail ?? record.error ?? record.message;
  if (typeof detail === "string") return detail.slice(0, 500);
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") return item.msg;
        return "";
      })
      .filter(Boolean);
    return parts.join("; ").slice(0, 500);
  }
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") {
    return detail.message.slice(0, 500);
  }
  return "";
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
