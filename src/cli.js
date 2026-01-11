#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { launchEngine } from "./engines.js";

function usage(exitCode = 0) {
	const text = `browser-keepalive

Usage:
  browser-keepalive --url <url> [--interval <seconds>] [--engine playwright|puppeteer] [--headed|--headless] [--ensure-engine]

Options:
  --url <url>                      URL to load (required)
  --interval <seconds>             Refresh interval in seconds (default: 60)
  --add-fragment                   Add random fragment each refresh (default: true)
  --no-add-fragment                Disable random fragment
  --reset-url                      Always navigate to the original --url (default: false)
  --engine <playwright|puppeteer>  Browser automation engine (default: playwright)
  --headed                         Launch with a visible browser window (default)
  --headless                       Launch without a visible browser window
  --ensure-engine                  If the selected engine isn't installed, prompt to install it (and Playwright browsers)
  --cdp-port <port>                Enable Chrome DevTools Protocol (CDP) on localhost:<port> and print endpoints
  --idle-refresh                   Only refresh when the browser has been idle for at least --interval seconds
  --help                           Show help
`;

	console[exitCode === 0 ? "log" : "error"](text);
	process.exit(exitCode);
}

function parseArgs(argv) {
	const out = {
		url: undefined,
		intervalSeconds: 60,
		addFragment: true,
		resetUrl: false,
		engine: "playwright",
		headless: false,
		ensureEngine: false,
		cdpPort: null,
		idleRefresh: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const raw = argv[i];
		if (raw === "--help" || raw === "-h") {
			usage(0);
		}

		if (!raw.startsWith("--")) {
			throw new Error(`Unexpected argument: ${raw}`);
		}

		const [key, maybeValue] = raw.slice(2).split("=", 2);

		const takeValue = () => {
			if (maybeValue !== undefined) {
				return maybeValue;
			}
			const next = argv[i + 1];
			if (next === undefined || next.startsWith("--")) {
				throw new Error(`Missing value for --${key}`);
			}
			i++;
			return next;
		};

		if (key === "url" || key === "u") {
			out.url = takeValue();
			continue;
		}

		if (key === "interval" || key === "i") {
			const value = Number(takeValue());
			if (!Number.isFinite(value) || value <= 0) {
				throw new Error("--interval must be a positive number of seconds");
			}
			out.intervalSeconds = value;
			continue;
		}

		if (key === "engine") {
			out.engine = takeValue();
			continue;
		}

		if (key === "add-fragment") {
			out.addFragment = true;
			continue;
		}

		if (key === "no-add-fragment") {
			out.addFragment = false;
			continue;
		}

		if (key === "reset-url") {
			out.resetUrl = true;
			continue;
		}

		if (key === "headed") {
			out.headless = false;
			continue;
		}

		if (key === "headless") {
			out.headless = true;
			continue;
		}

		if (key === "ensure-engine") {
			out.ensureEngine = true;
			continue;
		}

		if (key === "cdp-port") {
			out.cdpPort = normalizePort(takeValue());
			continue;
		}

		if (key === "idle-refresh") {
			out.idleRefresh = true;
			continue;
		}

		throw new Error(`Unknown option: --${key}`);
	}

	if (!out.url) {
		throw new Error("--url is required");
	}

	if (out.engine !== "playwright" && out.engine !== "puppeteer") {
		throw new Error("--engine must be either 'playwright' or 'puppeteer'");
	}

	return out;
}

function normalizePort(value) {
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0 || n > 65535) {
		throw new Error("--cdp-port must be an integer between 1 and 65535");
	}
	return n;
}

function stripHash(urlString) {
	try {
		const url = new URL(urlString);
		url.hash = "";
		return url.toString();
	} catch {
		return urlString;
	}
}

function withRandomFragment(urlString) {
	const base = stripHash(urlString);
	const url = new URL(base);
	url.hash = `keepalive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	return url.toString();
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingEngineError(err, engine) {
	const message = err instanceof Error ? err.message : String(err);
	return message.includes(`Cannot find package '${engine}'`) || message.includes(`Failed to import '${engine}'`);
}

function isPlaywrightMissingBrowserError(err) {
	const message = err instanceof Error ? err.message : String(err);
	const m = message.toLowerCase();
	return (
		m.includes("playwright") &&
		(m.includes("executable doesn't exist") ||
			m.includes("executable doesnt exist") ||
			m.includes("playwright install"))
	);
}

function commandExists(cmd) {
	const r = spawnSync(cmd, ["--version"], { stdio: "ignore" });
	return r.status === 0;
}

function pickPackageManager() {
	if (commandExists("pnpm")) return "pnpm";
	if (commandExists("npm")) return "npm";
	return null;
}

async function promptYesNo(question, defaultNo = true) {
	if (!input.isTTY) {
		return false;
	}

	const rl = createInterface({ input, output });
	try {
		const suffix = defaultNo ? "[y/N]" : "[Y/n]";
		const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
		if (!answer) return !defaultNo;
		return answer === "y" || answer === "yes";
	} finally {
		rl.close();
	}
}

function runInstallEngine(pm, engine) {
	if (pm === "pnpm") {
		return spawnSync("pnpm", ["add", engine], { stdio: "inherit" });
	}
	if (pm === "npm") {
		return spawnSync("npm", ["i", engine], { stdio: "inherit" });
	}
	throw new Error(`Unknown package manager: ${pm}`);
}

function runInstallPlaywrightChromium(pm) {
	if (pm === "pnpm") {
		return spawnSync("pnpm", ["exec", "playwright", "install", "chromium"], { stdio: "inherit" });
	}
	if (pm === "npm") {
		return spawnSync("npx", ["playwright", "install", "chromium"], { stdio: "inherit" });
	}
	throw new Error(`Unknown package manager: ${pm}`);
}

async function ensureEngineInstalled(engine) {
	const pm = pickPackageManager();
	if (!pm) {
		throw new Error(
			"No supported package manager found. Install pnpm or npm, then install the engine (e.g. `pnpm add playwright` or `npm i puppeteer`)."
		);
	}

	const ok = await promptYesNo(`[browser-keepalive] '${engine}' is not installed. Install it now?`, true);
	if (!ok) {
		throw new Error(
			`Missing engine '${engine}'. Install it with: ${pm === "pnpm" ? `pnpm add ${engine}` : `npm i ${engine}`}`
		);
	}

	const result = runInstallEngine(pm, engine);
	if (result.status !== 0) {
		throw new Error(`Failed to install '${engine}' (exit code ${result.status ?? "?"}).`);
	}

	if (engine === "playwright") {
		const installBrowsers = await promptYesNo(
			"[browser-keepalive] Install Playwright Chromium browser binaries too? (recommended)",
			false
		);
		if (installBrowsers) {
			const installResult = runInstallPlaywrightChromium(pm);
			if (installResult.status !== 0) {
				throw new Error(
					`Playwright installed, but failed to install Chromium browser binaries (exit code ${installResult.status ?? "?"}).`
				);
			}
		}
	}
}

async function ensurePlaywrightBrowsersInstalled() {
	const pm = pickPackageManager();
	if (!pm) {
		throw new Error(
			"No supported package manager found. Install Playwright, then run `playwright install chromium` (via pnpm/npm)."
		);
	}

	const ok = await promptYesNo(
		"[browser-keepalive] Playwright is installed but browser binaries are missing. Run `playwright install chromium` now?",
		true
	);
	if (!ok) {
		throw new Error("Playwright browser binaries missing. Run `playwright install chromium` and retry.");
	}

	const installResult = runInstallPlaywrightChromium(pm);
	if (installResult.status !== 0) {
		throw new Error(`Failed to install Playwright Chromium browser binaries (exit code ${installResult.status ?? "?"}).`);
	}
}

async function launchWithOptionalEnsure({ engine, headless, ensureEngine, cdpPort }) {
	try {
		return await launchEngine(engine, { headless, cdpPort });
	} catch (err) {
		if (!ensureEngine) {
			throw err;
		}

		if (isMissingEngineError(err, engine)) {
			await ensureEngineInstalled(engine);
			return await launchEngine(engine, { headless, cdpPort });
		}

		if (engine === "playwright" && isPlaywrightMissingBrowserError(err)) {
			await ensurePlaywrightBrowsersInstalled();
			return await launchEngine(engine, { headless, cdpPort });
		}

		throw err;
	}
}

function registerActivityTracking(page, markActivity) {
	const events = [
		"domcontentloaded",
		"load",
		"framenavigated",
		"request",
		"requestfinished",
		"requestfailed",
		"response",
	];

	for (const evt of events) {
		try {
			page.on(evt, () => markActivity(evt));
		} catch {
			// best-effort
		}
	}
}

async function waitForIdle({ intervalMs, getLastActivityAt, stoppedRef }) {
	while (!stoppedRef.stopped) {
		const now = Date.now();
		const idleForMs = now - getLastActivityAt();
		if (idleForMs >= intervalMs) {
			return;
		}

		const remainingMs = intervalMs - idleForMs;
		const sleepMs = Math.min(remainingMs, 5000);
		console.info(
			`[browser-keepalive] idle-refresh: waiting for idle (remaining ~${Math.ceil(remainingMs / 1000)}s)`
		);
		await sleep(sleepMs);
	}
}

async function waitForJson(url, timeoutMs) {
	const startedAt = Date.now();
	let lastErr;

	while (Date.now() - startedAt < timeoutMs) {
		try {
			if (typeof fetch !== "function") {
				throw new Error("global fetch() is not available (Node 18+ required)");
			}
			const res = await fetch(url, { headers: { accept: "application/json" } });
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			return await res.json();
		} catch (err) {
			lastErr = err;
			await sleep(250);
		}
	}

	throw lastErr ?? new Error(`Timed out fetching ${url}`);
}

async function printCdpEndpoints(cdpPort) {
	const base = `http://127.0.0.1:${cdpPort}`;
	console.info(`[browser-keepalive] CDP enabled: ${base}`);

	try {
		const version = await waitForJson(`${base}/json/version`, 10000);
		if (version?.webSocketDebuggerUrl) {
			console.info(`[browser-keepalive] CDP websocket: ${version.webSocketDebuggerUrl}`);
		}
	} catch (err) {
		console.warn(
			"[browser-keepalive] CDP: browser launched but could not read /json/version (you may need to wait a moment):",
			err
		);
	}
}

async function main() {
	let opts;
	try {
		opts = parseArgs(process.argv.slice(2));
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		usage(2);
		return;
	}

	const baseUrl = stripHash(opts.url);
	const firstUrl = opts.addFragment ? withRandomFragment(baseUrl) : baseUrl;

	const session = await launchWithOptionalEnsure({
		engine: opts.engine,
		headless: opts.headless,
		ensureEngine: opts.ensureEngine,
		cdpPort: opts.cdpPort,
	});

	if (opts.cdpPort) {
		await printCdpEndpoints(opts.cdpPort);
	}

	let stopped = false;
	const stoppedRef = { get stopped() { return stopped; } };

	let lastActivityAt = Date.now();
	const markActivity = (evt) => {
		lastActivityAt = Date.now();
		// uncommentable if needed: console.debug(`[browser-keepalive] activity: ${evt}`);
	};
	registerActivityTracking(session.page, markActivity);

	const stop = async (reason) => {
		if (stopped) return;
		stopped = true;
		console.info(`[browser-keepalive] stopping (${reason})...`);
		await session.close();
		process.exit(0);
	};

	process.on("SIGINT", () => void stop("SIGINT"));
	process.on("SIGTERM", () => void stop("SIGTERM"));

	console.info(
		`[browser-keepalive] engine=${session.engine} interval=${opts.intervalSeconds}s addFragment=${opts.addFragment} resetUrl=${opts.resetUrl} headless=${opts.headless} cdpPort=${opts.cdpPort ?? "off"} idleRefresh=${opts.idleRefresh}`
	);
	console.info(`[browser-keepalive] loading: ${firstUrl}`);

	await session.goto(firstUrl, { waitUntil: "domcontentloaded" });
	markActivity("initial-load");

	const intervalMs = opts.intervalSeconds * 1000;

	while (!stopped) {
		await sleep(intervalMs);
		if (stopped) break;

		if (opts.idleRefresh) {
			await waitForIdle({
				intervalMs,
				getLastActivityAt: () => lastActivityAt,
				stoppedRef,
			});
			if (stopped) break;
		}

		try {
			if (opts.resetUrl) {
				const nextUrl = opts.addFragment ? withRandomFragment(baseUrl) : baseUrl;
				console.info(`[browser-keepalive] goto: ${nextUrl}`);
				await session.goto(nextUrl, { waitUntil: "domcontentloaded" });
				continue;
			}

			if (opts.addFragment) {
				const current = await session.currentUrl();
				const currentBase = current && current !== "about:blank" ? stripHash(current) : baseUrl;
				const nextUrl = withRandomFragment(currentBase);
				console.info(`[browser-keepalive] goto (current+fragment): ${nextUrl}`);
				await session.goto(nextUrl, { waitUntil: "domcontentloaded" });
				continue;
			}

			console.info("[browser-keepalive] reload");
			await session.reload({ waitUntil: "domcontentloaded" });
		} catch (err) {
			console.error("[browser-keepalive] refresh failed:", err);
		}
	}
}

await main();
