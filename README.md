# browser-keepalive

[![CI](https://github.com/lc0rp/browser-keepalive/actions/workflows/ci.yml/badge.svg)](https://github.com/lc0rp/browser-keepalive/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/lc0rp/browser-keepalive/branch/main/graph/badge.svg)](https://codecov.io/gh/lc0rp/browser-keepalive)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Launch a browser, load a URL, and periodically refresh it to keep it alive.

## Install

```bash
git clone https://github.com/lc0rp/browser-keepalive.git
cd browser-keepalive
pnpm install

# Install a browser engine (pick one):
pnpm install playwright && npx playwright install chromium
# or: pnpm install puppeteer
```

> **npm/yarn users:** substitute your preferred package manager.

## Usage

```bash
node src/cli.js <url> [options]
```

### Examples

```bash
# Basic: refresh https://example.com every 60 seconds
node src/cli.js https://example.com

# Refresh every 5 minutes
node src/cli.js https://example.com -i 300

# Headless mode (no visible browser window)
node src/cli.js https://example.com --headless

# Disable cache busting
node src/cli.js https://example.com --no-cache-bust

# Enable CDP so another app can control the browser
node src/cli.js https://example.com -p 9222

# Auto-install missing engine (use -y to skip prompts)
node src/cli.js https://example.com --auto-install -y
```

## Options

| Option | Description |
|--------|-------------|
| `<url>` | Absolute URL to load (include `http://` or `https://`) (**required**) |
| `-i, --interval <sec>` | Refresh interval in seconds (default: `60`) |
| `--engine <name>` | `playwright` or `puppeteer` (default: `playwright`) |
| `--headless` | Hide browser window |
| `--cache-bust` | Add `?_cb=...` query param each refresh (default: `true`) |
| `--no-cache-bust` | Disable cache busting |
| `--always-reset` | Always navigate to original URL instead of refreshing current page |
| `--only-if-idle` | Wait for browser to be idle for the full interval before refreshing |
| `-p, --cdp-port <port>` | Enable [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) (CDP) on this port |
| `--auto-install` | Prompt to install engine/chromium browser, if not found |
| `-y, --yes` | Auto-confirm prompts |
| `-V, --version` | Show version |
| `-h, --help` | Show help |

## Alternate Ways to Run

The examples above use `node src/cli.js` directly. You can also:

```bash
# Via npm/pnpm (uses package.json "bin" entry)
pnpm exec browser-keepalive https://example.com
# or: npx browser-keepalive https://example.com

# Build a bundled version first
pnpm run build
node dist/cli.js https://example.com
# or just: ./dist/cli.js https://example.com
```

All methods are equivalent, pick whichever you prefer.

## CDP: Control the Browser From Another App

CDP (Chrome DevTools Protocol) lets another application take over the browser for automation. It works with Chromium only.

**Start keepalive with CDP enabled:**
```bash
node src/cli.js https://example.com -p 9222
```

**Attach from Playwright:**
```js
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
```

**Attach from Puppeteer:**
```js
import puppeteer from 'puppeteer';
// Use the webSocketDebuggerUrl printed when keepalive starts
const browser = await puppeteer.connect({ browserWSEndpoint: 'ws://127.0.0.1:9222/...' });
```

## Development

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build bundled version
pnpm build
```

## Requirements

- **Node.js 20+**
- **One of:** `playwright` or `puppeteer`

## Notes

- Refreshes are sequential (never overlapping).
- `--cache-bust` changes the query param each refresh to bypass caches.
- `--only-if-idle` waits for no network activity before refreshing — can delay indefinitely on busy pages.
- `--always-reset` navigates to the original URL; without it, the *current* page URL is refreshed (useful if you navigate manually).

## License

MIT
