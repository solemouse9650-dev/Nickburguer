import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});

const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
  assert.match(await page.title(), /Burger Nick/i);
  assert.doesNotMatch(await page.locator("body").innerText(), /Loli|Luli|Scaloneta/i);
  await page.locator("[data-add-cart]").first().waitFor({ state: "visible" });

  const duplicateIds = await page.locator("[id]").evaluateAll((nodes) => {
    const counts = new Map();
    nodes.forEach((node) => {
      counts.set(node.id, (counts.get(node.id) || 0) + 1);
    });
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  assert.deepEqual(duplicateIds, []);

  const missingInternalTargets = await page.locator('a[href^="#"]').evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href"))
      .filter(
        (href) =>
          href
          && href !== "#"
          && !href.startsWith("#gal-")
          && !document.getElementById(decodeURIComponent(href.slice(1)))
      )
  );
  assert.deepEqual(missingInternalTargets, []);

  await page.locator("[data-add-cart]").first().click();
  assert.equal(await page.locator("#cartCount").innerText(), "1");
  await page.locator("[data-open-cart]").click();
  await page.locator("#cartDrawer.is-open").waitFor();
  await page.locator("#cartDrawer [data-close-cart]").first().click();

  const galleryItem = page.locator(".gallery__item").first();
  if (await galleryItem.count()) {
    await galleryItem.click();
    await page.locator(".lightbox:target").waitFor();
    await page.keyboard.press("Escape");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#navToggle").click();
  assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("nav-open")), true);
  await page.locator('#nav a[href="#menu"]').click();
  assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("nav-open")), false);

  const brokenImages = await page.locator("img:visible").evaluateAll((images) =>
    images
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src)
  );
  assert.deepEqual(brokenImages, []);

  const reservationForm = page.locator("#reservationForm");
  await reservationForm.locator('[name="name"]').fill("Prueba E2E");
  await reservationForm.locator('[name="phone"]').fill("3760000099");
  assert.equal(await reservationForm.locator('[name="guests"]').inputValue(), "2");

  const adminPage = await context.newPage();
  adminPage.on("pageerror", (error) => errors.push(error.message));
  await adminPage.goto("http://127.0.0.1:4173/admin/", { waitUntil: "domcontentloaded" });
  await adminPage.locator("#loginView:not([hidden]), #adminApp:not([hidden])").first().waitFor();
  assert.match(await adminPage.title(), /Burger Nick/i);

  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      public: "render, catálogo, carrito, lightbox y navegación responsive OK",
      admin: "arranque y gate de autenticación OK",
    })
  );
} finally {
  await browser.close();
}
