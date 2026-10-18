import SamJs from "sam-js";

const RATE = 22050;

const SAM_VOICE = {
  male: { speed: 82, pitch: 72, throat: 110, mouth: 105 },
  female: { speed: 82, pitch: 32, throat: 145, mouth: 145 },
} as const;

export type LocalLine = {
  text: string;
  gender: "male" | "female";
};

function spokenText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunksFor(text: string) {
  const clean = spokenText(text);
  if (!clean) return [];
  const pieces: string[] = [];
  let pending = "";
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    const next = `${pending} ${sentence}`.trim();
    if (next.length > 160 && pending) {
      pieces.push(pending);
      pending = sentence;
    } else {
      pending = next;
    }
  }
  if (pending) pieces.push(pending);
  return pieces.flatMap((piece) => {
    if (piece.length <= 180) return [piece];
    const words = piece.split(" ");
    const groups: string[] = [];
    let group = "";
    for (const word of words) {
      const next = `${group} ${word}`.trim();
      if (next.length > 160 && group) {
        groups.push(group);
        group = word;
      } else {
        group = next;
      }
    }
    if (group) groups.push(group);
    return groups;
  });
}

function speakChunk(text: string, gender: LocalLine["gender"]) {
  const sam = new SamJs(SAM_VOICE[gender]);
  const pcm = sam.buf8(text);
  if (!(pcm instanceof Uint8Array) || pcm.byteLength === 0) return new Uint8Array();
  return pcm;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

function wavFromPcm(pcm: Uint8Array) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const wav = new Uint8Array(44 + pcm.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

export function synthesizeLocalSpeech(lines: LocalLine[]) {
  const gap = new Uint8Array(Math.round(RATE * 0.14)).fill(128);
  const parts: Uint8Array[] = [];
  for (const line of lines) {
    for (const chunk of chunksFor(line.text)) {
      const pcm = speakChunk(chunk, line.gender);
      if (pcm.byteLength > 0) parts.push(pcm, gap);
    }
  }
  if (parts.length === 0) {
    const backup = speakChunk("The dialogue is ready.", "male");
    if (backup.byteLength > 0) parts.push(backup);
  }
  const bytes = wavFromPcm(concat(parts));
  return {
    bytes,
    audioSrc: `data:audio/wav;base64,${Buffer.from(bytes).toString("base64")}`,
  };
}
