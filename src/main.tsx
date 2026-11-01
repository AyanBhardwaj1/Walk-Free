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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Website />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Installable and usable offline in production builds (never in dev, where
// a cached worker would serve stale modules).
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* The site works the same without it. */
    });
  });
