const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PASSTHROUGH_BYTES = 1_200_000;
const MAX_EDGE = 1600;
const TARGET_BYTES = 2_200_000;

export async function prepareReferenceImage(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Use an image under 25 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (file.size <= PASSTHROUGH_BYTES && longest <= MAX_EDGE) {
    bitmap.close();
    return readDataUrl(file);
  }

  let edge = MAX_EDGE;
  let quality = 0.86;
  let blob = await renderBlob(bitmap, edge, quality);
  while (blob.size > TARGET_BYTES && (quality > 0.55 || edge > 1024)) {
    if (quality > 0.55) quality -= 0.1;
    else edge = 1024;
    blob = await renderBlob(bitmap, edge, quality);
  }
  bitmap.close();
  return readDataUrl(new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: blob.type }));
}

function renderBlob(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Could not prepare that image."));
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp) {
          resolve(webp);
          return;
        }
        canvas.toBlob(
          (jpeg) => {
            if (!jpeg) {
              reject(new Error("Could not prepare that image."));
              return;
            }
            resolve(jpeg);
          },
          "image/jpeg",
          quality,
        );
      },
      "image/webp",
      quality,
    );
  });
}

function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      if (!value.startsWith("data:image/")) {
        reject(new Error("Could not prepare that image."));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error("Could not prepare that image."));
    reader.readAsDataURL(file);
  });
}
