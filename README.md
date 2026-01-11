# browser-keepalive

Launch a browser, load a URL, and periodically refresh it to keep it alive.

## Quick Start

```bash
cd /data/projects/browser-keepalive
pnpm install

# Install a browser engine (pick one):
pnpm add playwright && pnpm exec playwright install chromium
# or: pnpm add puppeteer

# Run it:
node src/cli.js https://example.com
```

## Usage

```bash
browser-keepalive <url> [options]
```

### Examples

```bash
# Basic: refresh every 60 seconds (default)
browser-keepalive https://example.com

# Refresh every 5 minutes
browser-keepalive https://example.com -i 300

# Headless, no cache busting
browser-keepalive https://example.com --headless --no-cache-bust

# Enable CDP for external automation
browser-keepalive https://example.com -p 9222

# Auto-install missing engine (scriptable with -y)
browser-keepalive https://example.com --auto-install -y
```

### How to Run

```bash
# Run directly from source
node src/cli.js https://example.com

# Or via pnpm
pnpm exec browser-keepalive https://example.com

# Or build and run the bundle
pnpm build && ./dist/cli.js https://example.com
```

## Requirements

- Node.js 18+
- One browser engine: `playwright` or `puppeteer`

## Options

| Option | Description |
|--------|-------------|
| `<url>` | URL to load (required) |
| `-i, --interval <sec>` | Refresh interval in seconds (default: 60) |
| `--engine <name>` | Browser engine: `playwright` or `puppeteer` (default: playwright) |
| `--headless` | Run browser without visible window |
| `--cache-bust` | Add cache-busting query param on refresh (default: true) |
| `--no-cache-bust` | Disable cache busting |
| `--always-reset` | Always navigate to original URL (vs refresh current page) |
| `--only-if-idle` | Only refresh after browser has been idle for the full interval |
| `-p, --cdp-port <port>` | Enable Chrome DevTools Protocol on this port |
| `--auto-install` | Prompt to install missing engine or browser binaries |
| `-y, --yes` | Auto-confirm prompts (for scripts) |
| `-V, --version` | Show version |
| `-h, --help` | Show help |

## CDP Control (Attach From Another App)

CDP gives full automation control over the browser (Chromium only). Run with `-p`:

```bash
browser-keepalive https://example.com -p 9222
```

Then attach from another Node.js app:

**Playwright:**
```js
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
```

**Puppeteer:**
```js
// Use the webSocketDebuggerUrl printed by browser-keepalive
const browser = await puppeteer.connect({ browserWSEndpoint: 'ws://...' });
```

## Building (Optional)

Bundle into a single file:

```bash
pnpm build
```

Creates `dist/cli.js` — a standalone script (still requires Node.js and a browser engine).

## Notes

- The refresh loop is sequential (no overlapping refreshes).
- `--cache-bust` adds a `?_cb=...` query param that changes each refresh.
- `--only-if-idle` can delay refreshes indefinitely on pages with constant network activity.
