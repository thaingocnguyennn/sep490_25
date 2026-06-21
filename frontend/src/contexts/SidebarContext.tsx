import { createContext, useContext, useState, type ReactNode } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  ocrMode: boolean;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
  enterOcrMode: () => void;
  exitOcrMode: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ocrMode, setOcrMode] = useState(false);

  const collapse = () => setCollapsed(true);
  const expand = () => setCollapsed(false);
  const toggle = () => setCollapsed((c) => !c);

  const enterOcrMode = () => {
    setOcrMode(true);
    setCollapsed(true);
  };

  const exitOcrMode = () => {
    setOcrMode(false);
    setCollapsed(false);
  };

  return (
    <SidebarContext.Provider value={{ collapsed, ocrMode, collapse, expand, toggle, enterOcrMode, exitOcrMode }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
