const { chromium } = require('playwright');

const BASE_URL = process.env.AQUA_URL || 'http://127.0.0.1';
const USERNAME = process.env.AQUA_USER || 'admin';
const PIN = process.env.AQUA_PIN || '1590';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (['error'].includes(msg.type())) errors.push(`console:${msg.type()}: ${msg.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const modal = document.getElementById('revModal');
    if (modal) modal.classList.add('hidden');
  });

  await page.waitForFunction(() => typeof window.apiFetch === 'function', { timeout: 5000 });
  await page.fill('#username', USERNAME);
  await page.fill('#pin', PIN);

  const loginResponsePromise = page.waitForResponse((res) => res.url().includes('/api/auth/login'), { timeout: 15000 }).catch(() => null);
  await page.evaluate(() => {
    const form = document.getElementById('loginForm');
    if (form && form.requestSubmit) form.requestSubmit();
  });
  const loginResponse = await loginResponsePromise;
  if (!loginResponse || loginResponse.status() !== 200) {
    const loginError = await page.$eval('#loginError', (el) => el.textContent || '').catch(() => '');
    throw new Error(`Login failed: ${loginError || 'no response'}`);
  }

  await page.waitForSelector('#appPanel:not(.hidden)');

  // Roster actions
  await page.waitForSelector('#timeBlocks');
  await page.click('#bulkMarkPresent', { force: true });
  await page.click('#bulkClearAttendance', { force: true });
  await page.click('#addSwimmerBtn', { force: true });
  await page.fill('#addSwimmerName', 'Test Swimmer');
  await page.click('#addSwimmerSave', { force: true });

  const notesButtons = await page.$$('button:has-text("Notes")');
  if (notesButtons.length) {
    await notesButtons[0].click({ force: true });
    await page.fill('#rosterNoteText', 'Test note');
    await page.click('#rosterNoteSave', { force: true });
  }

  // Reports tab (if visible)
  const reportsTab = await page.$('.page-tabs .tab[data-view="reports"]');
  if (reportsTab) {
    const cls = await reportsTab.getAttribute('class');
    if (!cls || !cls.includes('hidden')) {
      await reportsTab.click({ force: true });
      await page.waitForTimeout(500);
    }
  }

  // Observations tab (if visible)
  const obsTab = await page.$('.page-tabs .tab[data-view="observations"]');
  if (obsTab) {
    const cls = await obsTab.getAttribute('class');
    if (!cls || !cls.includes('hidden')) {
      await obsTab.click({ force: true });
      await page.waitForTimeout(500);
      const obsFormVisible = await page.isVisible('#obsFormPanel').catch(() => false);
      if (obsFormVisible) {
        await page.click('#obsLoadRosterBtn', { force: true });
        await page.click('#obsAddSwimmer', { force: true });
        await page.click('#obsSaveBtn', { force: true });
      }
    }
  }

  await browser.close();

  if (errors.length) {
    console.error('UI errors:', errors);
    process.exit(1);
  }

  console.log('UI check completed with no console/page errors.');
})();
