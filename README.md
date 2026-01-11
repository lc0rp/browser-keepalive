# browser-keepalive

A small Node.js CLI that launches a browser, loads a URL, and periodically refreshes it to keep it alive.

## Requirements

- Node.js 18+ (newer recommended)
- One of:
  - `playwright`
  - `puppeteer`

Install the engine you want:

```bash
cd /data/projects/browser-keepalive
pnpm add playwright
# and for Playwright, install a browser binary:
pnpm exec playwright install chromium

# or
pnpm add puppeteer
```

## Usage

```bash
browser-keepalive --url https://example.com --interval 60 --engine playwright --headed
```

### Options

- `--interval <seconds>` refresh interval in seconds (default: `60`)
- `--url <url>` initial URL to load (required)
- `--add-fragment` add a random fragment each refresh to bypass caching (default: `true`)
  - use `--no-add-fragment` to disable
- `--reset-url` always navigate to the original `--url` on each refresh (default: `false`)
  - when false, it refreshes the browser’s current URL so you can browse around
- `--engine <playwright|puppeteer>` (default: `playwright`)
- `--headed` visible browser window (default)
- `--headless` no visible browser window
- `--ensure-engine` if the selected engine isn’t installed, prompt to install it (and for Playwright, optionally install Chromium too)
- `--cdp-port <port>` enable Chrome DevTools Protocol (CDP) on `127.0.0.1:<port>` and print endpoints
- `--idle-refresh` collision control: only refresh when the browser has been idle for at least `--interval` seconds

## CDP Control (Attach From Another App)

CDP gives full automation control (Chromium-only). Run keepalive with a CDP port:

```bash
browser-keepalive --url https://example.com --engine playwright --cdp-port 9222
```

Then attach from another Node app:

- Playwright:
  - `chromium.connectOverCDP('http://127.0.0.1:9222')`
- Puppeteer:
  - Use the `webSocketDebuggerUrl` printed by keepalive and call `puppeteer.connect({ browserWSEndpoint })`

## Build

This is “buildable” as a single bundled JS file (engines stay external so you can choose one at install time):

```bash
cd /data/projects/browser-keepalive
pnpm install
pnpm build
./dist/cli.js --help
```

## Notes

- If `--add-fragment` is enabled, the fragment is replaced each cycle (it won’t grow forever).
- The loop is sequential (no overlapping refreshes).
- `--idle-refresh` can delay refreshes indefinitely on pages with constant background network activity.
