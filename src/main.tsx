import React from "react";
import { createRoot } from "react-dom/client";
import { createCostellationApp } from "./backstage/app";
import "./styles.css";

const app = createCostellationApp(window.location.origin);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{app.createRoot()}</React.StrictMode>,
);
