import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

test("exposes the three-pane navigation and restores a mobile deep link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#trends");

  const navigation = page.getByRole("navigation", {
    name: "Workspace sections",
  });
  await expect(
    navigation.getByRole("button", { name: "Show Today pane" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Show Trends pane" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("button", { name: "Show Coaching pane" }),
  ).toBeVisible();

  const panes = page.getByRole("group", { name: "Workspace panes" });
  await expect(panes).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("region", { name: "Today" })).toBeAttached();
  await expect(page.getByRole("region", { name: "Trends" })).toBeAttached();
  await expect(
    page.getByRole("region", { name: "Coaching", exact: true }),
  ).toBeAttached();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  await expect
    .poll(() =>
      panes.evaluate((element) =>
        Math.round(element.scrollLeft / element.clientWidth),
      ),
    )
    .toBe(1);
});

test("mobile dots and native arrow paging replace the current history entry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const historyLength = await page.evaluate(() => history.length);
  const navigation = page.getByRole("navigation", {
    name: "Workspace sections",
  });
  const panes = page.getByRole("group", { name: "Workspace panes" });

  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");
  await navigation.getByRole("button", { name: "Show Trends pane" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  await expect
    .poll(() =>
      panes.evaluate((element) =>
        Math.round(element.scrollLeft / element.clientWidth),
      ),
    )
    .toBe(1);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await panes.focus();
  await panes.press("ArrowRight");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#coaching");
  await panes.press("ArrowLeft");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test("mobile pane changes reveal a shorter destination from the bottom of a long pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#trends");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const before = await page.evaluate(() => window.scrollY);

  const panes = page.getByRole("group", { name: "Workspace panes" });
  await panes.evaluate((element) =>
    element.scrollTo({ left: element.clientWidth * 2, behavior: "auto" }),
  );

  const coaching = page.getByRole("region", {
    name: "Coaching",
    exact: true,
  });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#coaching");
  await expect
    .poll(() =>
      coaching.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(() =>
      coaching.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThan(844);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before);
});

test("desktop stacks sections and keeps the sticky section nav in sync", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#coaching");
  const today = page.getByRole("region", { name: "Today" });
  const trends = page.getByRole("region", { name: "Trends" });
  const coaching = page.getByRole("region", {
    name: "Coaching",
    exact: true,
  });
  const navigation = page.getByRole("navigation", {
    name: "Workspace sections",
  });
  await expect(navigation.locator(".pane-nav__dot").first()).toBeHidden();

  const boxes = await Promise.all([
    today.boundingBox(),
    trends.boundingBox(),
    coaching.boundingBox(),
  ]);
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
  await expect
    .poll(() =>
      coaching.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThanOrEqual(200);
  await expect(
    navigation.getByRole("button", { name: "Show Coaching pane" }),
  ).toHaveAttribute("aria-current", "page");

  await navigation.getByRole("button", { name: "Show Trends pane" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  await expect
    .poll(() =>
      trends.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThanOrEqual(150);
});

test("canonicalizes malformed routes and preserves selection across reload and resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#not-a-pane");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");

  await page.goto("/#coaching");
  await page.reload();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#coaching");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#coaching");
  await expect
    .poll(() =>
      page
        .getByRole("region", { name: "Coaching", exact: true })
        .evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThanOrEqual(200);

  await page.evaluate(() => {
    location.hash = "#trends";
  });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  await page.setViewportSize({ width: 390, height: 844 });
  const panes = page.getByRole("group", { name: "Workspace panes" });
  await expect
    .poll(() =>
      panes.evaluate((element) =>
        Math.round(element.scrollLeft / element.clientWidth),
      ),
    )
    .toBe(1);
});

test("reduced motion uses instant pane navigation without IntersectionObserver", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: undefined,
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    const paneScroller =
      document.querySelector<HTMLElement>(".workspace-panes")!;
    const original = paneScroller.scrollTo.bind(paneScroller);
    Object.defineProperty(window, "__paneScrollBehaviors", {
      configurable: true,
      value: [] as ScrollBehavior[],
    });
    paneScroller.scrollTo = (
      options?: ScrollToOptions | number,
      y?: number,
    ) => {
      if (typeof options === "object") {
        (
          window as unknown as { __paneScrollBehaviors: ScrollBehavior[] }
        ).__paneScrollBehaviors.push(options.behavior ?? "auto");
      }
      if (typeof options === "number") original(options, y ?? 0);
      else original(options);
    };
  });

  await page.getByRole("button", { name: "Show Coaching pane" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#coaching");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __paneScrollBehaviors: ScrollBehavior[] })
          .__paneScrollBehaviors,
    ),
  ).toContain("auto");
});
