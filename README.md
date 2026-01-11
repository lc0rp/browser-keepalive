# browser-keepalive

A small Node.js CLI that launches a browser, loads a URL, and periodically refreshes it to keep it alive.

## Quick Start

```bash
cd /data/projects/browser-keepalive
pnpm install

# Install a browser engine (pick one):
pnpm add playwright && pnpm exec playwright install chromium
# or: pnpm add puppeteer

# Run it:
node src/cli.js --url https://example.com
```

## How to Run

There are three ways to run the CLI. They all do the same thing:

```bash
# 1. Run directly from source (no build step needed)
node src/cli.js --url https://example.com

# 2. Use pnpm/npx (uses the "bin" entry in package.json)
pnpm exec browser-keepalive --url https://example.com
# or: npx browser-keepalive --url https://example.com

# 3. Build first, then run the bundled version
pnpm build
node dist/cli.js --url https://example.com
# or just: ./dist/cli.js --url https://example.com
```

Pick whichever you prefer. Option 1 is simplest for development. Option 3 produces a single bundled file if you want to copy it somewhere.

## Requirements

- Node.js 18+
- One browser engine: `playwright` or `puppeteer`

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--url <url>` | *(required)* | URL to load |
| `--interval <seconds>` | `60` | Refresh interval in seconds |
| `--engine <name>` | `playwright` | Browser engine: `playwright` or `puppeteer` |
| `--headed` | ✓ | Show the browser window |
| `--headless` | | Hide the browser window |
| `--add-fragment` | `true` | Add random fragment on refresh to bypass cache |
| `--no-add-fragment` | | Disable fragment addition |
| `--reset-url` | `false` | Always navigate to original URL (vs refresh current page) |
| `--ensure-engine` | | Prompt to install missing engine |
| `--cdp-port <port>` | | Enable Chrome DevTools Protocol on this port |
| `--idle-refresh` | | Only refresh after idle period (no recent network activity) |

### Examples

```bash
# Basic: refresh every 60 seconds (default)
node src/cli.js --url https://example.com

# Refresh every 5 minutes, headless
node src/cli.js --url https://example.com --interval 300 --headless

# Use Puppeteer instead of Playwright
node src/cli.js --url https://example.com --engine puppeteer

# Enable CDP so another app can attach
node src/cli.js --url https://example.com --cdp-port 9222
```

## CDP Control (Attach From Another App)

CDP gives full automation control over the browser (Chromium only). Run with `--cdp-port`:

```bash
node src/cli.js --url https://example.com --cdp-port 9222
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

Bundle everything into a single file:

```bash
pnpm build
```

This creates `dist/cli.js` — a standalone script you can copy and run anywhere (still requires Node.js and a browser engine installed).

## Notes

- The refresh loop is sequential (no overlapping refreshes).
- `--add-fragment` replaces the fragment each cycle (won't grow forever).
- `--idle-refresh` can delay refreshes indefinitely on pages with constant background network activity.
