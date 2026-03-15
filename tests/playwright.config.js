import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120000,
  expect: {
    timeout: 30000,
  },
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  webServer: [
    {
      command: "cd ../backend && npm run dev",
      url: "http://localhost:3001/",
      reuseExistingServer: true,
      timeout: 180000,
    },
    {
      command: "cd ../frontend && npx vite --port 5173 --strictPort",
      url: "http://localhost:5173/",
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
  reporter: [["list"]],
});
