"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DEFAULT_VOICE_ID, type VoiceId } from "@/lib/voices";

const VoiceContext = createContext<{
  voice: VoiceId;
  saveVoice: (voice: VoiceId) => void;
} | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_VOICE_ID);
  const value = useMemo(
    () => ({
      voice,
      saveVoice: setVoice,
    }),
    [voice],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useDefaultVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useDefaultVoice must be used inside VoiceProvider.");
  }
  return context;
}
