// Помощники для игр на общем каркасе kit.js: имитация скрытия и возврата вкладки.
async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
const hideTab = (page) => setHidden(page, true);
const showTab = (page) => setHidden(page, false);

module.exports = { hideTab, showTab };
