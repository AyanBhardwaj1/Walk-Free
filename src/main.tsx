import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import React from "react";
import { createRoot } from "react-dom/client";
import Website from "./Website";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Website />
  </React.StrictMode>,
);
