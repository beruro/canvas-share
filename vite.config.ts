import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" 让构建产物可以部署在任意子路径（GitHub Pages 项目页）
export default defineConfig({
  plugins: [react()],
  base: "./",
});
