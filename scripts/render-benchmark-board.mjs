import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const directory = resolve('docs/benchmarks/social-review-20261006');
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const [name, width, height] of [
    ['mimori-benchmark-board', 2400, 3000], ['mimori-benchmark-wide', 2560, 1440],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(`${directory}/${name}.html`).href);
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      const { width, height } = svg.viewBox.baseVal;
      const clipped = [...svg.querySelectorAll('text')].flatMap((text) => {
        const b = text.getBBox();
        return b.x < 0 || b.y < 0 || b.x + b.width > width || b.y + b.height > height
          ? [text.textContent] : [];
      });
      return { clipped, textElements: svg.querySelectorAll('text').length,
        fontReady: document.fonts.check('32px "Fira Sans"') };
    });
    if (result.clipped.length || !result.fontReady) throw new Error(JSON.stringify({ name, ...result }));
    await page.screenshot({ path: `${directory}/${name}.png` });
    await page.pdf({ path: `${directory}/${name}.pdf`, width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    checks.push({ name, width, height, ...result });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${directory}/render-verification.json`, JSON.stringify(checks, null, 2) + '\n');
console.log(JSON.stringify(checks));
