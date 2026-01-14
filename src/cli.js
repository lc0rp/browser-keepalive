#!/usr/bin/env node

import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { Command } from "commander";
import { launchEngine, normalizePort as normalizeCdpPort } from "./engines.js";
import {
	parseInterval,
	validateEngine,
	validateUrlString,
	stripQueryParam,
	withCacheBuster,
	sleep,
	isMissingEngineError,
	isPlaywrightMissingBrowserError,
	isPuppeteerMissingBrowserError,
} from "./utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const program = new Command();

program
	.name("browser-keepalive")
	.description("Launch a browser, load a URL, and periodically refresh it to keep it alive.")
	.version(pkg.version, "-V, --version", "Show version number")
	.argument("<url>", "URL to load")
	.option("-i, --interval <seconds>", "Refresh interval in seconds", "60")
	.option("--cache-bust", "Add cache-busting query param on each refresh (default: true)")
	.option("--no-cache-bust", "Disable cache-busting query param")
	.option("--always-reset", "Always navigate to the original URL instead of refreshing current page")
	.option("--engine <name>", "Browser engine: playwright or puppeteer", "playwright")
	.option("--headless", "Run browser without visible window")
	.option("--auto-install", "Prompt to install missing engine or browser binaries")
	.option(
		"--user-data-dir <dir>",
		"Persist browser profile/cookies in this directory (default: ~/.browser-keepalive/chrome)",
		join(homedir(), ".browser-keepalive", "chrome")
	)
	.option("-p, --cdp-port <port>", "Enable Chrome DevTools Protocol on this port")
	.option("--only-if-idle", "Only refresh when browser has been idle for the full interval")
	.option("-y, --yes", "Auto-confirm all prompts (for scripts)")
	.addHelpText(
		"after",
		`
Examples:
  $ browser-keepalive https://example.com
  $ browser-keepalive https://example.com -i 300
  $ browser-keepalive https://example.com --headless --no-cache-bust
  $ browser-keepalive https://example.com -p 9222    # enable CDP
  $ browser-keepalive https://example.com --auto-install -y
`
	)
	.showHelpAfterError(true);

program.parse();

const opts = program.opts();
const url = program.args[0];

// Validate and normalize options
let config;
try {
	config = {
		url: validateUrlString(url),
		intervalSeconds: parseInterval(opts.interval),
		cacheBust: opts.cacheBust,
		alwaysReset: opts.alwaysReset || false,
		engine: validateEngine(opts.engine),
		headless: opts.headless || false,
		autoInstall: opts.autoInstall || false,
		userDataDir: String(opts.userDataDir || "").trim(),
		cdpPort: normalizeCdpPort(opts.cdpPort),
		onlyIfIdle: opts.onlyIfIdle || false,
		yes: opts.yes || false,
	};
} catch (err) {
	console.error(`Error: ${err.message}`);
	process.exit(1);
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

async function promptYesNo(question, defaultYes = false) {
	// Auto-confirm if --yes was passed
	if (config.yes) {
		console.info(`${question} [auto-confirmed with --yes]`);
		return true;
	}

	if (!input.isTTY) {
		return false;
	}

	const rl = createInterface({ input, output });
	try {
		const suffix = defaultYes ? "[Y/n]" : "[y/N]";
		const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
		if (!answer) return defaultYes;
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

function runInstallPuppeteerChrome(pm) {
	if (pm === "pnpm") {
		return spawnSync("pnpm", ["exec", "puppeteer", "browsers", "install", "chrome"], { stdio: "inherit" });
	}
	if (pm === "npm") {
		return spawnSync("npx", ["puppeteer", "browsers", "install", "chrome"], { stdio: "inherit" });
	}
	throw new Error(`Unknown package manager: ${pm}`);
}

async function ensureEngineInstalled(engine) {
	const pm = pickPackageManager();
	if (!pm) {
		throw new Error(
			"No supported package manager found. Install pnpm or npm, then install the engine (e.g. `pnpm add playwright`)."
		);
	}

	const ok = await promptYesNo(`'${engine}' is not installed. Install it now?`);
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
		const installBrowsers = await promptYesNo("Install Playwright Chromium browser binaries too? (recommended)", true);
		if (installBrowsers) {
			const installResult = runInstallPlaywrightChromium(pm);
			if (installResult.status !== 0) {
				throw new Error(
					`Playwright installed, but failed to install Chromium (exit code ${installResult.status ?? "?"}).`
				);
			}
		}
	}

	if (engine === "puppeteer") {
		const installBrowsers = await promptYesNo(
			"Install Puppeteer Chrome browser binaries too? (recommended)",
			true
		);
		if (installBrowsers) {
			const installResult = runInstallPuppeteerChrome(pm);
			if (installResult.status !== 0) {
				throw new Error(
					`Puppeteer installed, but failed to install Chrome (exit code ${installResult.status ?? "?"}).`
				);
			}
		}
	}
}

async function ensurePlaywrightBrowsersInstalled() {
	const pm = pickPackageManager();
	if (!pm) {
		throw new Error("No supported package manager found. Run `playwright install chromium` manually.");
	}

	const ok = await promptYesNo("Playwright browser binaries are missing. Install Chromium now?");
	if (!ok) {
		throw new Error("Playwright browser binaries missing. Run `playwright install chromium` and retry.");
	}

	const installResult = runInstallPlaywrightChromium(pm);
	if (installResult.status !== 0) {
		throw new Error(`Failed to install Playwright Chromium (exit code ${installResult.status ?? "?"}).`);
	}
}

async function ensurePuppeteerBrowsersInstalled() {
	const pm = pickPackageManager();
	if (!pm) {
		throw new Error("No supported package manager found. Run `npx puppeteer browsers install chrome` manually.");
	}

	const ok = await promptYesNo("Puppeteer browser binaries are missing. Install Chrome now?");
	if (!ok) {
		throw new Error("Puppeteer browser binaries missing. Run `npx puppeteer browsers install chrome` and retry.");
	}

	const installResult = runInstallPuppeteerChrome(pm);
	if (installResult.status !== 0) {
		throw new Error(`Failed to install Puppeteer Chrome (exit code ${installResult.status ?? "?"}).`);
	}
}

function ensureDir(dir) {
	if (!dir) return;
	try {
		mkdirSync(dir, { recursive: true });
	} catch (err) {
		throw new Error(`Failed to create user data dir '${dir}': ${err.message || err}`);
	}
}

async function launchWithOptionalInstall({ engine, headless, autoInstall, userDataDir, cdpPort }) {
	try {
		return await launchEngine(engine, { headless, userDataDir, cdpPort });
	} catch (err) {
		if (!autoInstall) {
			throw err;
		}

		if (isMissingEngineError(err, engine)) {
			await ensureEngineInstalled(engine);
			return await launchEngine(engine, { headless, userDataDir, cdpPort });
		}

		if (engine === "playwright" && isPlaywrightMissingBrowserError(err)) {
			await ensurePlaywrightBrowsersInstalled();
			return await launchEngine(engine, { headless, userDataDir, cdpPort });
		}

		if (engine === "puppeteer" && isPuppeteerMissingBrowserError(err)) {
			await ensurePuppeteerBrowsersInstalled();
			return await launchEngine(engine, { headless, userDataDir, cdpPort });
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
		console.info(`[keepalive] waiting for idle (~${Math.ceil(remainingMs / 1000)}s remaining)`);
		await sleep(sleepMs);
	}
}

async function waitForJson(urlString, timeoutMs) {
	const startedAt = Date.now();
	let lastErr;

	while (Date.now() - startedAt < timeoutMs) {
		try {
			if (typeof fetch !== "function") {
				throw new Error("global fetch() is not available (Node 18+ required)");
			}
			const res = await fetch(urlString, { headers: { accept: "application/json" } });
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			return await res.json();
		} catch (err) {
			lastErr = err;
			await sleep(250);
		}
	}

	throw lastErr ?? new Error(`Timed out fetching ${urlString}`);
}

async function printCdpEndpoints(cdpPort) {
	const base = `http://127.0.0.1:${cdpPort}`;
	console.info(`[keepalive] CDP enabled: ${base}`);

	try {
		const version = await waitForJson(`${base}/json/version`, 10000);
		if (version?.webSocketDebuggerUrl) {
			console.info(`[keepalive] CDP websocket: ${version.webSocketDebuggerUrl}`);
		}
	} catch (err) {
		console.warn("[keepalive] CDP: could not read /json/version:", err.message || err);
	}
}

async function main() {
	const baseUrl = config.cacheBust ? stripQueryParam(config.url, "_cb") : config.url;
	const firstUrl = config.cacheBust ? withCacheBuster(baseUrl) : baseUrl;

	ensureDir(config.userDataDir);
	const session = await launchWithOptionalInstall({
		engine: config.engine,
		headless: config.headless,
		autoInstall: config.autoInstall,
		userDataDir: config.userDataDir,
		cdpPort: config.cdpPort,
	});

	if (config.cdpPort) {
		await printCdpEndpoints(config.cdpPort);
	}

	let stopped = false;
	const stoppedRef = {
		get stopped() {
			return stopped;
		},
	};

	let lastActivityAt = Date.now();
	const markActivity = () => {
		lastActivityAt = Date.now();
	};
	registerActivityTracking(session.page, markActivity);

	const stop = async (reason) => {
		if (stopped) return;
		stopped = true;
		console.info(`[keepalive] stopping (${reason})...`);
		await session.close();
		process.exit(0);
	};

	process.on("SIGINT", () => void stop("SIGINT"));
	process.on("SIGTERM", () => void stop("SIGTERM"));

	console.info(
		`[keepalive] engine=${session.engine} interval=${config.intervalSeconds}s cacheBust=${config.cacheBust} alwaysReset=${config.alwaysReset} headless=${config.headless} userDataDir=${config.userDataDir || "(none)"} cdp=${config.cdpPort ?? "off"} onlyIfIdle=${config.onlyIfIdle}`
	);
	console.info(`[keepalive] loading: ${firstUrl}`);

	await session.goto(firstUrl, { waitUntil: "domcontentloaded" });
	markActivity();

	const intervalMs = config.intervalSeconds * 1000;

	while (!stopped) {
		await sleep(intervalMs);
		if (stopped) break;

		if (config.onlyIfIdle) {
			await waitForIdle({
				intervalMs,
				getLastActivityAt: () => lastActivityAt,
				stoppedRef,
			});
			if (stopped) break;
		}

		try {
			if (config.alwaysReset) {
				const nextUrl = config.cacheBust ? withCacheBuster(baseUrl) : baseUrl;
				console.info(`[keepalive] goto: ${nextUrl}`);
				await session.goto(nextUrl, { waitUntil: "domcontentloaded" });
				continue;
			}

			if (config.cacheBust) {
				const current = await session.currentUrl();
				const currentBase = current && current !== "about:blank" ? stripQueryParam(current, "_cb") : baseUrl;
				const nextUrl = withCacheBuster(currentBase);
				console.info(`[keepalive] goto: ${nextUrl}`);
				await session.goto(nextUrl, { waitUntil: "domcontentloaded" });
				continue;
			}

			console.info("[keepalive] reload");
			await session.reload({ waitUntil: "domcontentloaded" });
		} catch (err) {
			console.error("[keepalive] refresh failed:", err);
		}
	}
}

await main();
