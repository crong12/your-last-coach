import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

test("renders the fixture-backed HRV chart grammar on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#trends");

  const card = page.locator('[data-chart-card="hrv"]');
  await expect(card).toBeVisible();
  await expect(card.getByText("HRV", { exact: true })).toBeVisible();
  await expect(card.locator("[data-chart-current-value]")).toHaveAttribute(
    "aria-label",
    "55 ms",
  );
  await expect(
    card.getByText("7-night avg 55 ms", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("Flat versus recorded nights", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("1 of 7 nights recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("Source: seeded synthetic COROS-shaped observations", {
      exact: true,
    }),
  ).toBeVisible();

  const svg = card.locator('svg[data-chart="hrv"]');
  await expect(svg).toHaveAttribute("viewBox", "0 0 720 280");
  await expect(svg).toHaveAttribute("width", "100%");
  await expect(svg.locator("title")).toHaveText("HRV trend");
  await expect(svg.locator("desc")).toContainText("55 milliseconds");
  const gridlineCount = await svg.locator("[data-chart-gridline]").count();
  expect(gridlineCount).toBeGreaterThanOrEqual(2);
  expect(gridlineCount).toBeLessThanOrEqual(4);
  await expect(svg.locator("[data-chart-y-label]")).toHaveCount(gridlineCount);
  await expect(svg.locator('[data-series="hrv"]')).toHaveCount(0);
  await expect(svg.locator("[data-missing-date]")).toHaveCount(6);

  const readout = card.locator('[data-chart-readout="hrv"]');
  await expect(readout).toHaveAttribute("aria-live", "polite");
  await expect(readout).toHaveText("26 Aug · 55 ms");
  await expect(
    card.getByRole("button", {
      name: "Inspect HRV for 26 August, 55 milliseconds",
    }),
  ).toBeVisible();

  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(documentWidth).toBeLessThanOrEqual(360);
  await page.screenshot({
    path: "/tmp/issue-63-hrv-mobile.png",
    fullPage: true,
  });
});

test("keeps the readout fixed while click and keyboard inspection change its content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#trends");

  const card = page.locator('[data-chart-card="hrv"]');
  const readout = card.locator('[data-chart-readout="hrv"]');
  const before = await readout.boundingBox();

  const missing = card.getByRole("button", {
    name: "Inspect HRV for 24 August, no recording",
  });
  await missing.click();
  await expect(readout).toHaveText("24 Aug · No recording");
  expect(await readout.boundingBox()).toEqual(before);

  const observed = card.getByRole("button", {
    name: "Inspect HRV for 26 August, 55 milliseconds",
  });
  await observed.focus();
  await observed.press("Space");
  await expect(readout).toHaveText("26 Aug · 55 ms");
  expect(await observed.boundingBox()).toEqual(
    expect.objectContaining({
      width: expect.any(Number),
      height: expect.any(Number),
    }),
  );
  const observedBox = await observed.boundingBox();
  expect(observedBox!.width).toBeGreaterThanOrEqual(44);
  expect(observedBox!.height).toBeGreaterThanOrEqual(44);
});

test("contains the static chart on desktop and under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#trends");

  const card = page.locator('[data-chart-card="hrv"]');
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  expect(cardBox!.width).toBeLessThan(1100);
  const svg = card.locator('svg[data-chart="hrv"]');
  expect(await svg.evaluate((element) => element.getAnimations().length)).toBe(
    0,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
  await page.screenshot({
    path: "/tmp/issue-63-hrv-desktop.png",
    fullPage: true,
  });
});

test("preserves passive annotation hit testing and activates adaptation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/e2e/hrv-chart-harness.html");

  const phaseLabel = page.locator("[data-chart-phase-label]");
  await expect(phaseLabel).toHaveText("Base phase");
  await expect(phaseLabel).toHaveClass(/chart-annotation__label--phase/);
  await expect
    .poll(() =>
      phaseLabel.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontVariantCaps: style.fontVariantCaps,
          textTransform: style.textTransform,
        };
      }),
    )
    .toEqual({
      fontVariantCaps: "all-small-caps",
      textTransform: "uppercase",
    });

  const layerOrder = await page.evaluate(() => {
    const passive = document.querySelector(
      '[data-chart-annotation-layer="passive"]',
    );
    const series = document.querySelector("[data-chart-series]");
    const interactive = document.querySelector(
      '[data-chart-annotation-layer="interactive"]',
    );
    return {
      passiveBeforeSeries: Boolean(
        passive &&
        series &&
        passive.compareDocumentPosition(series) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      seriesBeforeInteractive: Boolean(
        series &&
        interactive &&
        series.compareDocumentPosition(interactive) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      passivePointerEvents: passive
        ? getComputedStyle(passive).pointerEvents
        : null,
    };
  });
  expect(layerOrder).toEqual({
    passiveBeforeSeries: true,
    seriesBeforeInteractive: true,
    passivePointerEvents: "none",
  });

  const marker = page.locator('[data-chart-annotation-kind="adaptation"]');
  const diamond = marker.locator("[data-chart-adaptation-diamond]");
  await expect(diamond).toBeVisible();

  const ordinaryPoint = page.getByRole("button", {
    name: "Inspect HRV for 24 August, 51 milliseconds",
  });
  await ordinaryPoint.click();
  const readout = page.locator('[data-chart-readout="hrv"]');
  await expect(readout).toHaveText("24 Aug · 51 ms");

  await diamond.click();

  await expect(readout).toContainText(
    "25 Aug · Approved adaptation: Reduce load",
  );
  const viewAdaptation = page.getByRole("button", {
    name: "View adaptation",
  });
  await expect(viewAdaptation).toBeVisible();
  await viewAdaptation.click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-adaptation-callback",
    "adaptation:one",
  );
});
