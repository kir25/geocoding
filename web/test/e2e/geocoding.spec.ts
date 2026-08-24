import { expect, test, type Page } from '@playwright/test';

/**
 * Runs against the committed sample fixture, which holds nine cities including
 * Boston and Jamaica Plain, MA. Assertions stay within what that fixture
 * guarantees so the suite does not depend on a network fetch of the full
 * GeoNames export.
 */

const SEARCH = '.search__input';
const OPTION = '.search__option';
const MARKER = '.leaflet-marker-icon';
const STATUS = '[role="status"]';

async function search(page: Page, text: string) {
  await page.fill(SEARCH, text);
  await page.waitForSelector(OPTION);
}

/**
 * Waits for a pan/zoom animation to finish.
 *
 * Selecting a suggestion calls flyTo with an 800ms duration. Clicking during
 * that window lands wherever the map happens to be mid-flight — an early
 * version of this test clicked while travelling from the US view to Boston and
 * resolved a point in Oklahoma.
 */
async function waitForMapIdle(page: Page) {
  await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
  await page.waitForTimeout(1_000);
}

/** Clicks the map away from centre, so the marker cannot swallow the click. */
async function clickMap(page: Page, xRatio = 0.3, yRatio = 0.7) {
  const box = await page.locator('.map').boundingBox();
  if (!box) throw new Error('map not visible');

  await page.mouse.click(
    box.x + box.width * xRatio,
    box.y + box.height * yRatio,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
});

test('loads with both interactions available and nothing selected', async ({
  page,
}) => {
  await expect(page.locator('h1')).toHaveText('Geocoding');
  await expect(page.locator(STATUS)).toHaveText(
    'Search for a place, or click anywhere on the map',
  );
  await expect(page.locator(MARKER)).toHaveCount(0);
});

test('typing surfaces suggestions from the API', async ({ page }) => {
  await search(page, 'bos');

  await expect(page.locator(OPTION).first()).toHaveText('Boston, MA, USA');
});

test('selecting a suggestion moves the map and drops a marker', async ({
  page,
}) => {
  await search(page, 'bos');
  await page.locator(OPTION).first().click();

  await expect(page.locator(MARKER)).toHaveCount(1);
  await expect(page.locator(STATUS)).toContainText('Boston, MA, USA');
  // The footer prints the resolved coordinates, so this asserts the geocode
  // round trip rather than just the text the user clicked.
  await expect(page.locator(STATUS)).toContainText('42.3');
});

test('the marker image loads rather than falling back to broken alt text', async ({
  page,
}) => {
  await search(page, 'bos');
  await page.locator(OPTION).first().click();
  await expect(page.locator(MARKER)).toHaveCount(1);

  // Leaflet's default icon resolves a path that 404s under a bundler; a broken
  // image still produces an <img>, so presence alone would pass.
  const size = await page
    .locator(MARKER)
    .first()
    .evaluate((el) => (el as HTMLImageElement).naturalWidth);

  expect(size).toBeGreaterThan(0);
});

test('clicking the map resolves the point and fills the search field', async ({
  page,
}) => {
  // Move to Boston first: the fixture only covers nine places, so a click has
  // to land near one of them to be inside the API's 100 km bound.
  await search(page, 'bos');
  await page.locator(OPTION).first().click();
  await expect(page.locator(MARKER)).toHaveCount(1);
  await waitForMapIdle(page);

  // Register the wait before the click: a fast response can arrive before a
  // listener attached afterwards ever sees it.
  const reverse = page.waitForResponse((r) => r.url().includes('/reverse'));
  await clickMap(page);
  await reverse;

  await expect(page.locator(SEARCH)).not.toHaveValue('Boston, MA, USA');
  await expect(page.locator(SEARCH)).toHaveValue(/, MA \d{5}, USA$/);
  await expect(page.locator(MARKER)).toHaveCount(1);
});

test('a map click does not trigger a search for the address it wrote back', async ({
  page,
}) => {
  const autocompleteCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/autocomplete')) {
      autocompleteCalls.push(request.url());
    }
  });

  const reverse = page.waitForResponse((r) => r.url().includes('/reverse'));
  await clickMap(page, 0.5, 0.5);
  await reverse;
  await page.waitForTimeout(600); // longer than the 250ms debounce

  expect(autocompleteCalls).toHaveLength(0);
  await expect(page.locator(OPTION)).toHaveCount(0);
});

test('the keyboard drives the suggestion list', async ({ page }) => {
  await search(page, 'b');

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.search__option--active')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator(OPTION)).toHaveCount(0);
});

test('a query with no matches says so', async ({ page }) => {
  await page.fill(SEARCH, 'zzzzzzzz');

  await expect(page.locator('.search__empty')).toHaveText('No matches');
});

test('clicking far outside the dataset reports no location', async ({
  page,
}) => {
  // Zooming out first keeps this independent of how much data is loaded: at
  // world zoom the mid-Atlantic is thousands of kilometres from any US ZIP, so
  // the API's distance bound applies whether the fixture holds nine rows or the
  // full forty thousand.
  await page.locator('.leaflet-control-zoom-out').click();
  await page.locator('.leaflet-control-zoom-out').click();
  await waitForMapIdle(page);

  const reverse = page.waitForResponse((r) => r.url().includes('/reverse'));
  await clickMap(page, 0.88, 0.5);
  await reverse;

  await expect(page.locator(STATUS)).toHaveText(
    'No known location near that point',
  );
});
