import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => {
  localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
});
await page.goto("http://localhost:5173/#trends");
await page.waitForTimeout(1500);
const pane = page.locator(".trends-pane");
await pane.screenshot({ path: "/tmp/trends-full.png" });
await browser.close();
