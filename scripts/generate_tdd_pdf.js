#!/usr/bin/env node
/**
 * Build a presentation-ready PDF from docs/TDD.md.
 *
 * Chrome is used as the print engine: the Markdown is rendered to a styled
 * HTML document, then printed through the DevTools protocol so the PDF gets
 * real page numbers and clean margins. No cloud service and no API key needed.
 *
 * Requirements:
 *   - Node.js 22+ (uses the built-in WebSocket client)
 *   - Google Chrome or Chromium available on PATH, or CHROME_BIN set
 */

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { marked } = require('marked');

const ROOT = path.join(__dirname, '..');
const TDD_PATH = path.join(ROOT, 'docs', 'TDD.md');
const OUTPUT_PATH = path.join(ROOT, 'docs', 'TDD.pdf');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      const found = spawnSync('which', [candidate], { encoding: 'utf8' });
      if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
    }
  }

  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }

  throw new Error(
    'Chrome or Chromium was not found. Install it or set CHROME_BIN to the browser executable.'
  );
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForDebugEndpoint(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page');
        if (page) return page;
      }
    } catch {
      // Chrome has not opened the debugging port yet.
    }
    await sleep(200);
  }
  throw new Error('Chrome started but its debugging endpoint did not become available.');
}

function connectCdp(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          return new Promise((resolveCommand, rejectCommand) => {
            const id = nextId++;
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand, method });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        }
      });
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (!message.id || !pending.has(message.id)) return;
      const command = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        command.reject(
          new Error(`${command.method}: ${message.error.message || 'Chrome command failed.'}`)
        );
      } else {
        command.resolve(message.result);
      }
    });

    socket.addEventListener('error', () => {
      reject(new Error('Could not connect to Chrome DevTools.'));
    });
  });
}

function extractMetadata(markdown) {
  const repository =
    markdown.match(/\*\*Public repository:\*\*\s*`?([^`\n]+)`?/i)?.[1]?.trim() ||
    'Repository URL not set';

  const preparedFor =
    markdown.match(/\*\*Prepared for:\*\*\s*(.+)/i)?.[1]?.trim() || 'Company A Staffing, Noida';
  const author = markdown.match(/\*\*Author:\*\*\s*(.+)/i)?.[1]?.trim() || 'Ankit Sinha';
  const date = markdown.match(/\*\*Date:\*\*\s*(.+)/i)?.[1]?.trim() || 'November 2026';
  const version = markdown.match(/\*\*Document version:\*\*\s*(.+)/i)?.[1]?.trim() || '2.0';

  return { repository, preparedFor, author, date, version };
}

function renderDocument(markdown) {
  // Remove the Markdown title and metadata block; the cover carries them.
  const bodyMarkdown = markdown.replace(/^# Technical Design Document[\s\S]*?\n---\n/, '');
  const bodyHtml = marked.parse(bodyMarkdown, { gfm: true, breaks: false });
  const meta = extractMetadata(markdown);

  const headings = [...bodyMarkdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
  const toc = headings
    .map((heading) => {
      const numbered = heading.match(/^(\d+)\.\s+(.*)$/);
      const number = numbered ? numbered[1].padStart(2, '0') : '';
      const title = numbered ? numbered[2] : heading;
      return `<li><span class="toc-number">${number}</span><span>${title}</span></li>`;
    })
    .join('\n');

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Shortlist — Technical Design Document</title>
<style>
  :root {
    --navy: #102a3c;
    --navy-soft: #17465c;
    --teal: #2f8f83;
    --blue: #1f6f8b;
    --ink: #1f2933;
    --muted: #5b6b78;
    --line: #d7e0e6;
    --wash: #f3f8f8;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    color: var(--ink);
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Cover */
  .cover {
    break-after: page;
    page-break-after: always;
    min-height: 250mm;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 4mm;
    overflow: hidden;
  }
  .cover-band {
    padding: 22mm 18mm 17mm;
    color: #fff;
    background: linear-gradient(135deg, #0d2637 0%, #17465c 64%, #24726f 100%);
  }
  .cover-kicker {
    margin: 0 0 2mm;
    color: #a8d8d1;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 2.4px;
    text-transform: uppercase;
  }
  .cover h1 {
    margin: 12mm 0 4mm;
    font-size: 44pt;
    line-height: 0.98;
    letter-spacing: -1.5px;
    font-weight: 750;
  }
  .cover-subtitle {
    max-width: 150mm;
    margin: 0;
    color: #e3f0f2;
    font-size: 15pt;
    line-height: 1.35;
    font-weight: 400;
  }
  .cover-label {
    margin: 18mm 0 0;
    color: #a8d8d1;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .cover-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 14mm 18mm 12mm;
  }
  .cover-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7mm 12mm;
    margin: 0;
  }
  .cover-meta div {
    padding-top: 3mm;
    border-top: 1px solid var(--line);
  }
  .cover-meta dt {
    margin: 0 0 1.2mm;
    color: var(--muted);
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }
  .cover-meta dd {
    margin: 0;
    color: var(--navy);
    font-size: 10.5pt;
    font-weight: 650;
  }
  .cover-repo {
    margin-top: 9mm;
    padding: 4.5mm 5mm;
    background: var(--wash);
    border-left: 2.5pt solid var(--teal);
    font-size: 9pt;
    overflow-wrap: anywhere;
  }
  .cover-repo span {
    display: block;
    margin-bottom: 1.2mm;
    color: var(--muted);
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 1.1px;
    text-transform: uppercase;
  }
  .cover-repo a { color: var(--blue); text-decoration: none; }
  .cover-note {
    margin: 8mm 0 0;
    color: var(--muted);
    font-size: 8pt;
    line-height: 1.5;
  }

  /* Contents */
  .toc {
    break-after: page;
    page-break-after: always;
    padding-top: 6mm;
  }
  .toc h2 {
    margin: 0 0 7mm;
    padding-bottom: 3mm;
    color: var(--navy);
    border-bottom: 1.4pt solid var(--teal);
    font-size: 19pt;
    letter-spacing: -0.3px;
  }
  .toc ol { margin: 0; padding: 0; list-style: none; }
  .toc li {
    display: flex;
    gap: 5mm;
    padding: 2.2mm 0;
    border-bottom: 0.5pt solid #e7eef1;
    font-size: 10pt;
  }
  .toc-number {
    min-width: 9mm;
    color: var(--teal);
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.8px;
  }

  /* Body */
  .doc h1 {
    margin: 0 0 5mm;
    color: var(--navy);
    font-size: 24pt;
    letter-spacing: -0.6px;
  }
  .doc h2 {
    margin: 9mm 0 4mm;
    padding-bottom: 2.5mm;
    color: var(--navy);
    border-bottom: 1.2pt solid var(--teal);
    font-size: 15pt;
    letter-spacing: -0.2px;
    break-after: avoid;
    page-break-after: avoid;
  }
  .doc h2:first-child { margin-top: 0; }
  .doc h3 {
    margin: 6mm 0 2.5mm;
    color: var(--blue);
    font-size: 11pt;
    break-after: avoid;
    page-break-after: avoid;
  }
  .doc h4 { margin: 4mm 0 2mm; color: var(--navy); font-size: 9.8pt; }
  .doc p { margin: 0 0 3mm; orphans: 3; widows: 3; }
  .doc ul, .doc ol { margin: 0 0 3.5mm 5mm; padding-left: 4mm; }
  .doc li { margin-bottom: 1mm; }
  .doc strong { color: #17384b; }
  .doc a { color: var(--blue); text-decoration: none; overflow-wrap: anywhere; }
  .doc hr { margin: 5mm 0; border: 0; border-top: 0.7pt solid #dbe5e9; }
  .doc code {
    padding: 0.2mm 1mm;
    border-radius: 1mm;
    background: #eef3f5;
    color: #17384b;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.86em;
  }
  .doc pre {
    margin: 2mm 0 5mm;
    padding: 4mm;
    border-radius: 2mm;
    background: #0f2433;
    color: #dce8ed;
    font-size: 7.4pt;
    line-height: 1.42;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .doc pre code { padding: 0; background: transparent; color: inherit; font-size: inherit; }
  .doc blockquote {
    margin: 0 0 4mm;
    padding: 3mm 4mm;
    background: var(--wash);
    border-left: 2.5pt solid var(--teal);
    color: #334c5a;
  }
  .doc table {
    width: 100%;
    margin: 2mm 0 5mm;
    border-collapse: collapse;
    font-size: 8pt;
    line-height: 1.4;
  }
  .doc th, .doc td {
    padding: 1.8mm 2mm;
    border: 0.6pt solid #cbdbe0;
    vertical-align: top;
    text-align: left;
  }
  .doc th { background: #eaf3f4; color: #12394a; font-weight: 700; }
  .doc tbody tr:nth-child(even) { background: #f8fbfc; }
  .doc tr { break-inside: avoid; page-break-inside: avoid; }
</style>
</head>
<body>
  <section class="cover">
    <div class="cover-band">
      <p class="cover-kicker">Technical Design Document</p>
      <h1>Shortlist</h1>
      <p class="cover-subtitle">AI-assisted resume screening<br>and client shortlist portal</p>
      <p class="cover-label">A credible core slice, documented honestly</p>
    </div>
    <div class="cover-body">
      <dl class="cover-meta">
        <div><dt>Prepared for</dt><dd>${escapeHtml(meta.preparedFor)}</dd></div>
        <div><dt>Author</dt><dd>${escapeHtml(meta.author)}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(meta.date)}</dd></div>
        <div><dt>Version</dt><dd>${escapeHtml(meta.version)}</dd></div>
      </dl>
      <div>
        <div class="cover-repo">
          <span>Public repository</span>
          <a href="${escapeHtml(meta.repository)}">${escapeHtml(meta.repository)}</a>
        </div>
        <p class="cover-note">
          This document describes the implementation in the repository as built. It does not claim a
          live deployment, customer adoption or performance results that have not been measured.
        </p>
      </div>
    </div>
  </section>

  <nav class="toc">
    <h2>Contents</h2>
    <ol>${toc}</ol>
  </nav>

  <main class="doc">${bodyHtml}</main>
</body>
</html>`;
}

async function printPdf(html, outputPath) {
  const chrome = findChrome();
  const port = await getFreePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortlist-tdd-'));
  const htmlPath = path.join(tempDir, 'tdd.html');
  const profileDir = path.join(tempDir, 'chrome-profile');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--hide-scrollbars',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  let socket;
  try {
    const page = await waitForDebugEndpoint(port);
    const cdp = await connectCdp(page.webSocketDebuggerUrl);
    socket = cdp;
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: pathToFileURL(htmlPath).href });

    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true
      });
      if (result.result?.value === 'complete') {
        ready = true;
        break;
      }
      await sleep(150);
    }
    if (!ready) throw new Error('The TDD HTML did not finish loading in Chrome.');

    await cdp.send('Runtime.evaluate', {
      expression: 'document.fonts && document.fonts.ready',
      awaitPromise: true
    });
    await sleep(300);

    const footer = `
      <div style="width:100%; padding:0 14mm; color:#80909b; font-family:Arial,Helvetica,sans-serif; font-size:7pt; display:flex; justify-content:space-between;">
        <span>Shortlist — Technical Design Document · Company A Staffing</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`;

    const printOptions = {
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footer,
      paperWidth: 8.27,
      paperHeight: 11.69,
      scale: 1,
      preferCSSPageSize: false
    };

    // Chrome versions differ on whether print margins are inches (double) or
    // CSS lengths (string). Try the current protocol first, then the older one.
    let pdf;
    try {
      pdf = await cdp.send('Page.printToPDF', {
        ...printOptions,
        marginTop: 0.55,
        marginBottom: 0.63,
        marginLeft: 0.55,
        marginRight: 0.55
      });
    } catch (error) {
      if (!/Invalid parameters/i.test(error.message)) throw error;
      pdf = await cdp.send('Page.printToPDF', {
        ...printOptions,
        marginTop: '14mm',
        marginBottom: '16mm',
        marginLeft: '14mm',
        marginRight: '14mm'
      });
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (!pdf?.data) throw new Error('Chrome did not return PDF data.');
    fs.writeFileSync(outputPath, Buffer.from(pdf.data, 'base64'));
  } finally {
    if (socket) socket.close();
    child.kill('SIGKILL');
    if (child.exitCode === null) {
      await new Promise((resolve) => child.once('exit', resolve));
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // A leftover temporary Chrome profile is harmless.
    }
  }
}

async function generateTddPdf({ quiet = false } = {}) {
  if (!fs.existsSync(TDD_PATH)) {
    throw new Error(`TDD Markdown not found at ${TDD_PATH}`);
  }
  const markdown = fs.readFileSync(TDD_PATH, 'utf8');
  const html = renderDocument(markdown);
  if (!quiet) console.log('Rendering docs/TDD.md with Chrome…');
  await printPdf(html, OUTPUT_PATH);
  if (!quiet) {
    const size = fs.statSync(OUTPUT_PATH).size;
    console.log(`TDD.pdf generated: ${OUTPUT_PATH} (${(size / 1024).toFixed(1)} KB)`);
  }
  return OUTPUT_PATH;
}

if (require.main === module) {
  generateTddPdf().catch((error) => {
    console.error(`TDD PDF generation failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { generateTddPdf };
