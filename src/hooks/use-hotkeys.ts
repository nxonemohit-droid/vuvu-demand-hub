import { useEffect } from "react";

type HotkeyHandler = (e: KeyboardEvent) => void;

/**
 * Bind keyboard shortcuts. By default ignores keypresses while typing in
 * inputs/textareas/contenteditable, except for Escape which is always handled.
 */
export function useHotkeys(map: Record<string, HotkeyHandler>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;
      const key = e.key;
      if (typing && key !== "Escape") return;
      const handler = map[key];
      if (handler) {
        handler(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);
}
