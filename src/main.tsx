import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import StudioApp from "./pages/StudioApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/atelier">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/studio" element={<StudioApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
