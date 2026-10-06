import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const logoBase64 = readFileSync(resolve('public/logo.png')).toString('base64');
const logoUri = `data:image/png;base64,${logoBase64}`;

const benchmarks = [
  {
    name: "InjecAgent 1.0 (Indirect Injection)",
    sub: "Tool-output prompt injection across 17 tool contexts",
    mimori: "• 85.7%",
    llama: "85.7%",
    laya: "1.4%",
    regex: "0.0%"
  },
  {
    name: "InjecAgent Enhanced (Direct Overrides)",
    sub: "Explicit instruction override prefixes (1,054 cases)",
    mimori: "• 100%",
    llama: "85.7%",
    laya: "1.4%",
    regex: "100%"
  },
  {
    name: "Capability Sandbox Containment",
    sub: "Out-of-scope tool invocation prevention (1,054 chains)",
    mimori: "• 100%",
    llama: "—",
    laya: "—",
    regex: "—"
  },
  {
    name: "Authored Security Challenges",
    sub: "Multi-step injection evasion & prompt exfiltration",
    mimori: "• 100%",
    llama: "100%",
    laya: "12.5%",
    regex: "0.0%"
  },
  {
    name: "Benign Tool Specificity (1 - FPR)",
    sub: "Legitimate tool output acceptance rate (33 controls)",
    mimori: "• 97.0%",
    llama: "97.0%",
    laya: "97.0%",
    regex: "93.9%"
  },
  {
    name: "Synthetic Task Generalization",
    sub: "Task-aware calibrated domain held-out split (40 attacks)",
    mimori: "• 32.5%",
    llama: "—",
    laya: "32.5%",
    regex: "0.0%"
  },
  {
    name: "Runtime Execution Reliability",
    sub: "Zero error rate / deterministic execution across runs",
    mimori: "• 100%",
    llama: "100%",
    laya: "100%",
    regex: "100%"
  }
];

function generateHtml({ colMode = 3 }) {
  const is4Col = colMode === 4;

  const benchWidth = is4Col ? 880 : 1020;
  const colWidth = is4Col ? 310 : 380;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: 2400px;
    height: 1350px;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #000000;
    position: relative;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  .logo {
    position: absolute;
    top: 65px;
    left: 80px;
    width: 62px;
    height: 62px;
    object-fit: contain;
  }

  .main-wrapper {
    position: absolute;
    top: 70px;
    left: 80px;
    right: 80px;
    bottom: 50px;
  }

  /* Super-headers above columns */
  .super-header-bar {
    display: flex;
    margin-bottom: 12px;
    height: 32px;
    align-items: flex-end;
  }
  .super-header-spacer {
    width: ${benchWidth}px;
  }
  .super-header-mimori {
    width: ${is4Col ? colWidth * 2 : colWidth};
    padding-left: 28px;
    font-size: 21px;
    font-weight: 500;
    color: #111111;
  }
  .super-header-baseline {
    padding-left: 38px;
    font-size: 21px;
    font-weight: 500;
    color: #111111;
  }

  /* Table structure */
  .table-container {
    display: flex;
    height: 1040px;
  }

  /* Benchmark column (Left side) */
  .col-benchmarks {
    width: ${benchWidth}px;
    display: flex;
    flex-direction: column;
    padding-right: 60px;
  }
  .bench-header-blank {
    height: 125px;
  }
  .bench-row {
    height: 125px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .bench-title {
    font-size: 26px;
    font-weight: 600;
    color: #111111;
    letter-spacing: -0.3px;
  }
  .bench-sub {
    font-size: 19px;
    font-weight: 400;
    color: #555555;
    margin-top: 5px;
    letter-spacing: -0.1px;
  }

  /* Highlight Column (MIMORI - Blue Box) */
  .col-highlight {
    width: ${colWidth}px;
    background: #9acdfe;
    border-radius: 3px;
    display: flex;
    flex-direction: column;
    padding: 0 32px;
  }
  .highlight-header {
    height: 125px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .highlight-header .model-sub {
    font-size: 20px;
    font-weight: 500;
    color: #111111;
  }
  .highlight-header .model-name {
    font-size: 30px;
    font-weight: 700;
    color: #000000;
    margin-top: 3px;
    letter-spacing: -0.4px;
  }
  .highlight-val-row {
    height: 125px;
    display: flex;
    align-items: center;
    font-size: 28px;
    font-weight: 700;
    color: #000000;
    letter-spacing: -0.3px;
  }

  /* Standard Model Column */
  .col-standard {
    width: ${colWidth}px;
    display: flex;
    flex-direction: column;
    padding: 0 32px;
  }
  .standard-header {
    height: 125px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .standard-header .model-sub {
    font-size: 20px;
    font-weight: 500;
    color: #111111;
  }
  .standard-header .model-name {
    font-size: 30px;
    font-weight: 700;
    color: #000000;
    margin-top: 3px;
    letter-spacing: -0.4px;
  }
  .standard-val-row {
    height: 125px;
    display: flex;
    align-items: center;
    font-size: 28px;
    font-weight: 500;
    color: #111111;
    letter-spacing: -0.3px;
  }

  /* Vertical Divider Line */
  .col-divider {
    width: 2px;
    background: #b8b8b8;
    height: 1000px;
    margin: 0 10px;
  }

  .footer-note {
    position: absolute;
    bottom: 25px;
    left: 80px;
    font-size: 15px;
    color: #777777;
    font-weight: 400;
  }
</style>
</head>
<body>

<img class="logo" src="${logoUri}" alt="MIMORI Logo" />

<div class="main-wrapper">

  <!-- Super-Header Row (e.g. "OpenAI" / "Claude") -->
  <div class="super-header-bar">
    <div class="super-header-spacer"></div>
    <div class="super-header-mimori">MIMORI</div>
    <div style="flex: 1;"></div>
    <div class="super-header-baseline">${is4Col ? 'Baselines' : 'Baseline'}</div>
    <div style="width: ${colWidth * 0.7}px;"></div>
  </div>

  <!-- Table Container with Perfectly Aligned Rows -->
  <div class="table-container">

    <!-- Benchmarks Column -->
    <div class="col-benchmarks">
      <div class="bench-header-blank"></div>
      ${benchmarks.map(b => `
        <div class="bench-row">
          <div class="bench-title">${b.name}</div>
          <div class="bench-sub">${b.sub}</div>
        </div>
      `).join('')}
    </div>

    <!-- Highlight Column: MIMORI Defense-in-Depth -->
    <div class="col-highlight">
      <div class="highlight-header">
        <div class="model-sub">MIMORI</div>
        <div class="model-name">Defense-in-Depth</div>
      </div>
      ${benchmarks.map(b => `
        <div class="highlight-val-row">${b.mimori}</div>
      `).join('')}
    </div>

    <!-- Column 2: Without Laya / Llama 3.1 8B -->
    <div class="col-standard">
      <div class="standard-header">
        <div class="model-sub">Without Laya</div>
        <div class="model-name">Llama 3.1 8B</div>
      </div>
      ${benchmarks.map(b => `
        <div class="standard-val-row">${b.llama}</div>
      `).join('')}
    </div>

    ${is4Col ? `
    <!-- Column 3 (Optional 4-col): Laya v0.3 Micro-model -->
    <div class="col-standard">
      <div class="standard-header">
        <div class="model-sub">Trained Head</div>
        <div class="model-name">Laya v0.3</div>
      </div>
      ${benchmarks.map(b => `
        <div class="standard-val-row">${b.laya}</div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Vertical Divider Line -->
    <div class="col-divider"></div>

    <!-- Baseline Column: Regex Scanner -->
    <div class="col-standard">
      <div class="standard-header">
        <div class="model-sub">Static Rules</div>
        <div class="model-name">Regex Scanner</div>
      </div>
      ${benchmarks.map(b => `
        <div class="standard-val-row">${b.regex}</div>
      `).join('')}
    </div>

  </div>

</div>

<div class="footer-note">
  * Local detector regression on Intel Core i5 CPU. InjecAgent subset (uiuc-kang-lab/InjecAgent, rev f19c9f2c) & authored challenges. Calibrated and audited locally.
</div>

</body>
</html>`;
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 2400, height: 1350 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  // 1. Render 3-column classic
  const html3 = generateHtml({ colMode: 3 });
  writeFileSync('docs/benchmarks/social-review-20261006/mimori-frontier-benchmark.html', html3);
  await page.setContent(html3);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: 'docs/benchmarks/social-review-20261006/mimori-frontier-benchmark.png',
    type: 'png'
  });
  console.log('Generated mimori-frontier-benchmark.png');

  // 2. Render 4-column variant (with Laya v0.3)
  const html4 = generateHtml({ colMode: 4 });
  writeFileSync('docs/benchmarks/social-review-20261006/mimori-frontier-benchmark-4col.html', html4);
  await page.setContent(html4);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: 'docs/benchmarks/social-review-20261006/mimori-frontier-benchmark-4col.png',
    type: 'png'
  });
  console.log('Generated mimori-frontier-benchmark-4col.png');

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
