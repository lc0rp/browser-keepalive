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
  --url <url>                 URL to load (required)
  --interval <seconds>        Refresh interval in seconds (default: 60)
  --add-fragment              Add random fragment each refresh (default: true)
  --no-add-fragment           Disable random fragment
  --reset-url                 Always navigate to the original --url (default: false)
  --engine <playwright|puppeteer>  Browser automation engine (default: playwright)
  --headed                    Launch with a visible browser window (default)
  --headless                  Launch without a visible browser window
  --ensure-engine             If the selected engine isn't installed, prompt to install it
  --help                      Show help
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

function runInstall(pm, engine) {
	if (pm === "pnpm") {
		return spawnSync("pnpm", ["add", engine], { stdio: "inherit" });
	}
	if (pm === "npm") {
		return spawnSync("npm", ["i", engine], { stdio: "inherit" });
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

	const result = runInstall(pm, engine);
	if (result.status !== 0) {
		throw new Error(`Failed to install '${engine}' (exit code ${result.status ?? "?"}).`);
	}
}

async function launchWithOptionalEnsure({ engine, headless, ensureEngine }) {
	try {
		return await launchEngine(engine, { headless });
	} catch (err) {
		if (!ensureEngine || !isMissingEngineError(err, engine)) {
			throw err;
		}

		await ensureEngineInstalled(engine);
		return await launchEngine(engine, { headless });
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
	});

	let stopped = false;
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
		`[browser-keepalive] engine=${session.engine} interval=${opts.intervalSeconds}s addFragment=${opts.addFragment} resetUrl=${opts.resetUrl} headless=${opts.headless}`
	);
	console.info(`[browser-keepalive] loading: ${firstUrl}`);

	await session.goto(firstUrl, { waitUntil: "domcontentloaded" });

	while (!stopped) {
		await sleep(opts.intervalSeconds * 1000);
		if (stopped) break;

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
