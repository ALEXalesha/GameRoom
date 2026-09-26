// Законы калькулятора: точная десятичная арифметика, приоритет операций, края
// (деление на ноль, длинные числа, очень малые и большие результаты), клавиатура и мышь.
const { test, expect } = require('@playwright/test');
const { openApp, expectInsideViewport } = require('./_apps-helpers');

const KEY = { '=': 'Enter', '⌫': 'Backspace', '⎋': 'Escape', '±': 'F9', '⌦': 'Delete' };

// Набрать последовательность клавиш: каждый символ - одна клавиша.
async function type(page, seq) {
  for (const ch of seq) await page.keyboard.press(KEY[ch] || ch);
}

const display = (page) => page.locator('#display');

// [что набрать, что должно быть на экране]. Экран: запятая, разряды через узкий пробел.
const CASES = [
  ['0.1+0.2=', '0,3'],
  ['0.3-0.1=', '0,2'],
  ['0.1+0.7=', '0,8'],
  ['1000000000.1-1000000000=', '0,1'],   // в числах с плавающей точкой здесь 0,100000023841858
  ['1.1*3=', '3,3'],
  ['0.1*3=', '0,3'],
  ['1.005*1000=', '1 005'],
  ['1/3=', '0,333333333333333'],
  ['1/3*3=', '1'],
  ['2/3=', '0,666666666666667'],
  ['1/7=', '0,142857142857143'],
  ['2+3*4=', '14'],
  ['2*3+4=', '10'],
  ['10-2-3=', '5'],
  ['8/2/2=', '2'],
  ['2+3*4-6/2=', '11'],
  ['3-5=', '−2'],
  ['5+*2=', '10'],             // вторая операция подряд заменяет первую
  ['2+3==', '8'],              // повтор «=» повторяет последнюю операцию
  ['2+3*=', '11'],             // «=» после операции берёт число с экрана: 2 + 3 × 3
  ['200+10%=', '220'],
  ['50*10%=', '5'],
  ['5±', '−5'],
  ['2+3=±', '−5'],
  ['1.5⌫', '1,'],
  ['123⌫⌫⌫⌫', '0'],
  ['99999999*99999999=', '9,9999998e+15'],
  ['0.000000001*0.000000001=', '1e−18'],
  ['1000000*1000000=', '1 000 000 000 000'],
  ['12345678901234567', '1 234 567 890 123 456'],  // больше 16 цифр не набирается
  ['0.5+0.5=', '1'],
  ['7⎋', '0'],
  ['7+8⌦2=', '9'],             // Delete стирает только набираемое число
];

test.describe('калькулятор: таблица случаев', () => {
  for (const [seq, expected] of CASES) {
    test(`${seq} → ${expected}`, async ({ page }) => {
      const errors = await openApp(page, 'calculator');
      await type(page, seq);
      await expect(display(page)).toHaveText(expected.replace(/ /g, ' '));
      expect(errors).toEqual([]);
    });
  }
});

test('деление на ноль: понятное сообщение, следующая цифра начинает заново', async ({ page }) => {
  const errors = await openApp(page, 'calculator');
  await type(page, '7/0=');
  await expect(display(page)).toHaveText('Нельзя делить на ноль');
  await expect(display(page)).toHaveClass(/error/);
  await type(page, '5+1=');
  await expect(display(page)).toHaveText('6');
  expect(errors).toEqual([]);
});

test('мышью: кнопки считают так же, как клавиатура', async ({ page }) => {
  const errors = await openApp(page, 'calculator');
  const click = async (label) => page.locator('.buttons button', { hasText: new RegExp(`^${label.replace(/[+]/g, '\\+')}$`) }).click();
  for (const b of ['0', ',', '1', '+', '0', ',', '2', '=']) await click(b);
  await expect(display(page)).toHaveText('0,3');
  await expect(page.locator('#expr')).toHaveText('0,1 + 0,2 =');
  for (const b of ['9', '÷', '0', '=']) await click(b);
  await expect(display(page)).toHaveText('Нельзя делить на ноль');
  await click('AC');
  await expect(display(page)).toHaveText('0');
  expect(errors).toEqual([]);
});

test('подсветка операции и кнопка C/AC', async ({ page }) => {
  await openApp(page, 'calculator');
  await type(page, '12');
  await expect(page.locator('#clearBtn')).toHaveText('C');
  await type(page, '*');
  await expect(page.locator('.op[data-op="*"]')).toHaveClass(/active/);
  await type(page, '3');
  await expect(page.locator('.op.active')).toHaveCount(0);
});

test('длинное число целиком помещается на экране', async ({ page }) => {
  await openApp(page, 'calculator');
  await type(page, '1234567890123456');
  const [sw, cw] = await display(page).evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});

test('копирование результата отдаёт число без разрядных пробелов', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page, 'calculator');
  await type(page, '1000*1.5=');
  await page.keyboard.press('Control+c');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toBe('1500');
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 700 }]) {
  test(`все кнопки видны целиком при ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openApp(page, 'calculator', { viewport });
    await expectInsideViewport(page, '.buttons button');
    await expectInsideViewport(page, '#display');
  });
}
