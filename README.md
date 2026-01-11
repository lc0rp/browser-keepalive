# browser-keepalive

Launch a browser, load a URL, and periodically refresh it to keep it alive.

## Install

```bash
git clone https://github.com/lc0rp/browser-keepalive.git
cd browser-keepalive
npm install

# Install a browser engine (pick one):
npm install playwright && npx playwright install chromium
# or: npm install puppeteer
```

> **pnpm/yarn users:** substitute your preferred package manager.

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
| `<url>` | URL to load (**required**) |
| `-i, --interval <sec>` | Refresh interval in seconds (default: `60`) |
| `--engine <name>` | `playwright` or `puppeteer` (default: `playwright`) |
| `--headless` | Hide browser window |
| `--cache-bust` | Add `?_cb=...` query param each refresh (default: `true`) |
| `--no-cache-bust` | Disable cache busting |
| `--always-reset` | Always navigate to original URL instead of refreshing current page |
| `--only-if-idle` | Wait for browser to be idle before refreshing |
| `-p, --cdp-port <port>` | Enable Chrome DevTools Protocol on this port |
| `--auto-install` | Prompt to install missing engine/browser |
| `-y, --yes` | Auto-confirm prompts (for scripts) |
| `-V, --version` | Show version |
| `-h, --help` | Show help |

## Alternate Ways to Run

The examples above use `node src/cli.js` directly. You can also:

```bash
# Via npm/pnpm (uses package.json "bin" entry)
npx browser-keepalive https://example.com

# Build a bundled version first
npm run build
node dist/cli.js https://example.com
```

All three methods are equivalent — pick whichever you prefer.

## CDP: Control the Browser From Another App

CDP (Chrome DevTools Protocol) lets another application take over the browser for automation. Chromium only.

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

## Requirements

- **Node.js 18+**
- **One of:** `playwright` or `puppeteer`

## Notes

- Refreshes are sequential (never overlapping).
- `--cache-bust` changes the query param each refresh to bypass caches.
- `--only-if-idle` waits for no network activity before refreshing — can delay indefinitely on busy pages.
- `--always-reset` navigates to the original URL; without it, the *current* page URL is refreshed (useful if you navigate manually).

## License

MIT
