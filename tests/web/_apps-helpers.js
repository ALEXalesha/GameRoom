// Помощники для проверок группы «приложения» (browser_1, calculator, player, python_ide,
// telegram, yandex-music, token-calc, english-abbreviations).
const { expect } = require('@playwright/test');
const { open, pageUrl } = require('../helpers');

// Открыть страницу без сети и вернуть список ошибок, который пополняется до конца проверки.
async function openApp(page, name, { viewport } = {}) {
  if (viewport) await page.setViewportSize(viewport);
  return open(page, name);
}

// Перезагрузить страницу тем же адресом (localStorage у file:// сохраняется в пределах теста).
async function reload(page, name) {
  await page.goto(pageUrl(name));
}

// Все элементы по селектору целиком видны в окне: не обрезаны краем и не требуют прокрутки.
async function expectInsideViewport(page, selector) {
  const vp = page.viewportSize();
  const boxes = await page.locator(selector).evaluateAll((els) => els
    .filter((el) => el.offsetParent !== null)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 20), l: r.left, t: r.top, r: r.right, b: r.bottom };
    }));
  expect(boxes.length, `нет видимых элементов ${selector}`).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.l, `${b.text}: левый край`).toBeGreaterThanOrEqual(-0.5);
    expect(b.t, `${b.text}: верхний край`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${b.text}: правый край`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.b, `${b.text}: нижний край`).toBeLessThanOrEqual(vp.height + 0.5);
  }
}

// Страница не шире окна: нет горизонтальной прокрутки.
async function expectNoHorizontalScroll(page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, 'горизонтальная прокрутка').toBeLessThanOrEqual(cw);
}

// Фан-концепт: пометка о том, что страница не связана с правообладателем, видна пользователю.
async function expectFanNotice(page) {
  await expect(page.getByText(/фан-концепт, не связан с правообладателем/i).first()).toBeVisible();
  await expect(page).toHaveTitle(/фан-концепт/i);
}

// ===== Маленькие файлы для проверок чтения документов =====

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ZIP без сжатия: { 'путь': 'содержимое' } → Buffer.
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const fname = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fname.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fname.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, fname, data);
    centrals.push(central, fname);
    offset += local.length + fname.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// Минимальный .docx с одним абзацем.
function makeDocx(paragraph) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return makeZip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${esc(paragraph)}</w:t></w:r></w:p></w:body></w:document>`,
  });
}

// Минимальный PDF с одной строкой латиницы.
function makePdf(line) {
  const content = `BT /F1 18 Tf 50 750 Td (${line.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += String(o).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// Число из текста вида «1 234» (разряды через неразрывный пробел).
function num(text) {
  return Number(String(text).replace(/[\s  ]/g, '').replace(',', '.'));
}

module.exports = {
  openApp, reload, expectInsideViewport, expectNoHorizontalScroll, expectFanNotice,
  makeZip, makeDocx, makePdf, num,
};
