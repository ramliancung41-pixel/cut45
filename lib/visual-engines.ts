export type VisualEngineId = "stock" | "premium";

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
    rate: "0 credits/sec",
    description: "Uses the free Wikimedia/MDN stock loop pipeline.",
  },
  {
    id: "premium",
    name: "Premium AI Video Generation",
    rate: "2 credits/sec",
    description: "Synthetic AI motion graphics for a paid premium tier.",
  },
];

export const PREMIUM_ENGINE_WARNING =
  "Requires a paid premium tier plan to generate synthetic AI motion graphics.";

export function isVisualEngineId(value: string): value is VisualEngineId {
  return VISUAL_ENGINES.some((engine) => engine.id === value);
}
