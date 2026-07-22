import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages เสิร์ฟที่ https://<user>.github.io/atelier/ — asset path ต้องขึ้นต้นด้วย /atelier/
  base: "/atelier/",
  plugins: [react(), tailwindcss()],
});
