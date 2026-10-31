import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import React from "react";
import { createRoot } from "react-dom/client";
import Website from "./Website";
import ErrorBoundary from "./components/ErrorBoundary";
import "./style.css";
import { applyTheme, loadTheme } from "./lib/theme";

// The workspace shows its saved style before the first paint (no flash).
if (/^\/(app|demo)(\/|$)/.test(window.location.pathname))
  applyTheme(loadTheme());
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Website />
    </ErrorBoundary>
  </React.StrictMode>,
);
