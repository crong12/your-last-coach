import { expect, test } from "@playwright/test";

test("serves the built fallback workspace without external runtime requests", async ({
  page,
}) => {
  const externalRequests = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4174") {
      externalRequests.add(url.href);
    }
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Your Training Plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Coach Agent connection: unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("Plan version 1")).toBeVisible();
  expect([...externalRequests]).toEqual([]);
});
