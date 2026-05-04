import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply persisted theme before first paint.
try {
  const stored = localStorage.getItem("voynova.theme.v1");
  const dark =
    stored === "dark" ||
    (stored == null && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(<App />);
