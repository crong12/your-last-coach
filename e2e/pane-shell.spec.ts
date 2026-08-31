import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

test("renders the Final Turn mark in the accessible home link", async ({
  page,
}) => {
  await page.goto("/");

  const home = page.getByRole("link", { name: "Your Last Coach home" });
  await expect(home).toBeVisible();
  await expect(home.locator('[data-brand-mark="final-turn"]')).toBeVisible();
  await expect(home.locator("svg")).toHaveAttribute("aria-hidden", "true");
});

test("publishes the Final Turn mark as the browser icon", async ({ page }) => {
  await page.goto("/");

  const iconHref = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(iconHref).toBe("/final-turn.svg");
  const response = await page.request.get(iconHref!);
  expect(response.ok()).toBe(true);
});

test("exposes the three-pane navigation and restores a mobile deep link @contract", async ({
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

test("mobile dots and native arrow paging replace the current history entry @contract", async ({
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

test("desktop switches panes from the app bar tabs @contract", async ({ page }) => {
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

  // The tabs live in the app bar, so the nav is inside the banner rather than
  // floating over the content.
  await expect(page.locator("header.topbar .pane-nav")).toBeVisible();

  await expect(coaching).toBeVisible();
  await expect(today).toBeHidden();
  await expect(trends).toBeHidden();
  await expect(
    navigation.getByRole("button", { name: "Show Coaching pane" }),
  ).toHaveAttribute("aria-current", "page");

  await navigation.getByRole("button", { name: "Show Trends pane" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  await expect(trends).toBeVisible();
  await expect(coaching).toBeHidden();
  await expect(today).toBeHidden();

  // Nothing is pinned over the evidence: the range toggle has a home in the
  // pane title row, above the first chart card.
  const [toggle, firstCard] = await Promise.all([
    page.locator(".trends-range-control").boundingBox(),
    page.locator('[data-chart-card="hrv"]').boundingBox(),
  ]);
  expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(firstCard!.y);
});

test("canonicalizes malformed routes and preserves selection across reload and resize @contract", async ({
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
  await expect(
    page.getByRole("region", { name: "Coaching", exact: true }),
  ).toBeVisible();

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
