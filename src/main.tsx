import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import StudioApp from "./pages/StudioApp";
import ModelCatalog from "./pages/ModelCatalog";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/studio" element={<StudioApp />} />
        <Route path="/models" element={<ModelCatalog />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
