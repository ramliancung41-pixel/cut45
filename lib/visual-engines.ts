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
    name: "Free Stock Assets",
    rate: "0 credits",
    description: "Wikimedia and Pexels stock clips.",
  },
  {
    id: "budget",
    name: "Budget AI Motion",
    rate: "45 credits",
    description: "Fal.ai fast open-source video models.",
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
