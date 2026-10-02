export const PROMPT_MAX = 800;

export const MOTION_STYLES = [
  {
    id: "subtle",
    name: "Subtle Motion",
    guidance:
      "Subtle living motion only: a gentle breeze, soft light flicker, and a barely drifting camera. Keep the subject stable.",
  },
  {
    id: "dynamic",
    name: "Dynamic Pan/Zoom",
    guidance:
      "Dynamic camera: a smooth push-in that opens into a lateral pan, with parallax between the foreground and background.",
  },
  {
    id: "slowmo",
    name: "Cinematic Slow-Mo",
    guidance:
      "Cinematic slow motion: time stretched, fabric and particles hanging in the air, shallow depth of field, and an elegant camera drift.",
  },
  {
    id: "action",
    name: "Action Flow",
    guidance:
      "Action flow: decisive forward movement, a motivated tracking camera, crisp impacts, and continuous energy through the frame.",
  },
] as const;

export type MotionStyleId = (typeof MOTION_STYLES)[number]["id"];

export function isMotionStyleId(value: string): value is MotionStyleId {
  return MOTION_STYLES.some((style) => style.id === value);
}

export function motionGuidance(value: string | null | undefined) {
  if (!value || !isMotionStyleId(value)) return "";
  return MOTION_STYLES.find((style) => style.id === value)?.guidance ?? "";
}

export function videoMotionPrompt(topic: string, style: string | null | undefined) {
  const guidance = motionGuidance(style);
  return [topic.trim(), "Vertical 9:16 cinematic motion.", guidance].filter(Boolean).join(" ");
}
