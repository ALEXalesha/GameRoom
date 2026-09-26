// Общий набор kit.js (меню, пауза, настройки, звук, клавиши) лежит копией рядом с каждой игрой,
// чтобы игра открывалась сама по себе. Закон: все копии одинаковы - правка в одной не должна
// тихо разойтись с остальными (источник - web/dino/kit.js).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const GAMES = ['dino', 'space_shooter', 'jungle-strike', 'mario'];
const read = (g) => fs.readFileSync(path.join(__dirname, '..', '..', 'web', g, 'kit.js'), 'utf8').replace(/\r\n/g, '\n');

test('копии общего набора kit.js во всех четырёх играх одинаковы', () => {
  const src = read('dino');
  expect(src.length).toBeGreaterThan(10000);
  for (const g of GAMES.slice(1)) expect(read(g) === src, `web/${g}/kit.js отличается от web/dino/kit.js`).toBe(true);
});

test('каждая игра подключает свой kit.js, а не чужой', () => {
  for (const g of GAMES) {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'web', g, 'index.html'), 'utf8');
    expect(html, g).toMatch(/<script src="kit\.js"><\/script>/);
  }
});
