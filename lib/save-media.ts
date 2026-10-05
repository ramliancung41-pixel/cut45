function isIos() {
  if (typeof navigator === "undefined") return false;
  const agent = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(agent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function deliver(blob: Blob, filename: string, popup: Window | null) {
  const url = URL.createObjectURL(blob);
  if (popup && !popup.closed) {
    popup.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
}

export async function saveGeneratedFile(fileUrl: string, filename: string) {
  if (isIos()) {
    const opened = window.open(
      `/api/image/download?fileUrl=${encodeURIComponent(fileUrl)}`,
      "_blank",
    );
    if (opened) return;
  }

  const response = await fetch("/api/image/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl }),
  });
  if (!response.ok) throw new Error("Could not download that file.");
  deliver(await response.blob(), filename, null);
}
