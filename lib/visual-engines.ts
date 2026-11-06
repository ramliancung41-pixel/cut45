export type VisualEngineId = "stock" | "budget" | "ultra";

export type VisualEngine = {
  id: VisualEngineId;
  name: string;
  rate: string;
  description: string;
};

export const VISUAL_ENGINES: VisualEngine[] = [
  {
    id: "stock",
    name: "Instant Stock Engine",
    rate: "0 credits",
    description: "Free preview",
  },
  {
    id: "budget",
    name: "Studio Fast Motion",
    rate: "3 credits / second",
    description: "High quality render",
  },
  {
    id: "ultra",
    name: "Ultra Cinematic AI",
    rate: "180 credits",
    description: "Fal.ai cinematic video models.",
  },
];

export function isVisualEngineId(value: string): value is VisualEngineId {
  return VISUAL_ENGINES.some((engine) => engine.id === value);
}

export function visualEngineName(id: VisualEngineId) {
  return VISUAL_ENGINES.find((engine) => engine.id === id)?.name ?? id;
}
