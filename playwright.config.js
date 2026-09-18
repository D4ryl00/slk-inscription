import { defineConfig, devices } from '@playwright/test';

// Layout invariants, not pixel snapshots: the club swaps the banner and the
// schedule every season, and fonts differ between machines, so image baselines
// would need constant re-approval. What is asserted instead is geometry that
// the stylesheet is supposed to guarantee — see test/e2e/layout.spec.js.
const PORT = 5199;

export default defineConfig({
  testDir: 'test/e2e',
  // A failing invariant is deterministic; a retry would only hide a flake in
  // the page setup, which we would rather see.
  retries: 0,
  fullyParallel: true,
  reporter: process.env.CI ? 'list' : 'line',
  use: { baseURL: `http://localhost:${PORT}` },

  // Two engines, each at phone and desktop width. Emulation is a viewport, a
  // user-agent and a pixel ratio against the browsers Playwright bundles — it
  // is not Android Chrome and not iOS Safari. It does catch a squeezed flex
  // control, but not a native widget that sizes itself on the device; the
  // header of test/e2e/layout.spec.js records which of the two known bugs falls
  // on which side.
  projects: [
    { name: 'pixel-5', use: { ...devices['Pixel 5'] } },
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } } },
  ],

  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
