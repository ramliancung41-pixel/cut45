"use client";

import { createContext, useContext } from "react";

const StudioChromeContext = createContext<(open: boolean) => void>(() => {});

export function StudioChromeProvider({
  value,
  children,
}: {
  value: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return <StudioChromeContext.Provider value={value}>{children}</StudioChromeContext.Provider>;
}

export function useStudioChrome() {
  return useContext(StudioChromeContext);
}
