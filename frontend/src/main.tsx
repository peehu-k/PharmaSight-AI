import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import App from "./App";

const root = document.getElementById("root");

if (!root) {
  document.body.innerHTML = '<div style="color: white; padding: 20px;">Error: Root element not found</div>';
} else {
  try {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  } catch (error) {
    console.error("Failed to render app:", error);
    root.innerHTML = `<div style="color: white; padding: 20px;">
      <h1>Error Loading App</h1>
      <p>${error}</p>
      <p>Check browser console for details</p>
    </div>`;
  }
}
