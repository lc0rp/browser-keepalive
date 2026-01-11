/**
 * Browser engine abstraction layer.
 * Supports Playwright and Puppeteer.
 */

/**
 * Normalize and validate CDP port.
 * @param {number | string | null | undefined} value
 * @returns {number | null}
 */
export function normalizePort(value) {
	if (value === undefined || value === null) {
		return null;
	}
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0 || n > 65535) {
		throw new Error(`Invalid CDP port: ${String(value)}`);
	}
	return n;
}

/**
 * Build Chromium launch arguments.
 * @param {{ cdpPort: number | null }} options
 * @returns {string[]}
 */
export function buildChromiumArgs({ cdpPort }) {
	const args = [];
	if (cdpPort) {
		args.push(`--remote-debugging-port=${cdpPort}`);
		args.push("--remote-debugging-address=127.0.0.1");
	}
	return args;
}

/**
 * Format error message with cause.
 * @param {string} message
 * @param {unknown} err
 * @returns {string}
 */
export function withCause(message, err) {
	if (err instanceof Error && err.message) {
		return `${message}\nCause: ${err.message}`;
	}
	return message;
}

/**
 * Create a session wrapper from a browser page.
 * @param {string} engine
 * @param {object} page
 * @param {object} browser
 * @param {number | null} cdpPort
 * @returns {object}
 */
export function createSession(engine, page, browser, cdpPort) {
	return {
		engine,
		page,
		cdpPort,
		async close() {
			await browser.close();
		},
		async goto(url, options) {
			return await page.goto(url, options);
		},
		async reload(options) {
			return await page.reload(options);
		},
		async currentUrl() {
			return page.url();
		},
	};
}

/**
 * Import a module dynamically with error handling.
 * Exported for testing purposes.
 * @param {string} moduleName
 * @returns {Promise<object>}
 */
export async function importModule(moduleName) {
	return await import(moduleName);
}

/**
 * Launch Playwright browser.
 * @param {{ headless: boolean, cdpPort: number | null, _import?: function }} options
 * @returns {Promise<object>}
 */
export async function launchPlaywright({ headless, cdpPort, _import = importModule }) {
	let mod;
	try {
		mod = await _import("playwright");
	} catch (err) {
		const message =
			"Failed to import 'playwright'. Install it in this project (e.g. `pnpm add playwright` or `npm i playwright`).";
		throw new Error(withCause(message, err));
	}

	const chromium = mod.chromium;
	if (!chromium) {
		throw new Error("'playwright' was imported but `chromium` export was not found.");
	}

	const args = buildChromiumArgs({ cdpPort });
	const browser = await chromium.launch({ headless, args });
	const context = await browser.newContext();
	const page = await context.newPage();

	return createSession("playwright", page, browser, cdpPort);
}

/**
 * Launch Puppeteer browser.
 * @param {{ headless: boolean, cdpPort: number | null, _import?: function }} options
 * @returns {Promise<object>}
 */
export async function launchPuppeteer({ headless, cdpPort, _import = importModule }) {
	let mod;
	try {
		mod = await _import("puppeteer");
	} catch (err) {
		const message =
			"Failed to import 'puppeteer'. Install it in this project (e.g. `pnpm add puppeteer` or `npm i puppeteer`).";
		throw new Error(withCause(message, err));
	}

	const puppeteer = mod.default ?? mod;
	if (!puppeteer?.launch) {
		throw new Error("'puppeteer' was imported but no `launch()` function was found.");
	}

	const args = buildChromiumArgs({ cdpPort });
	const browser = await puppeteer.launch({ headless, args });
	const page = await browser.newPage();

	return createSession("puppeteer", page, browser, cdpPort);
}

/**
 * Launch a browser using the specified engine.
 * @param {"playwright" | "puppeteer"} engine
 * @param {{ headless?: boolean, cdpPort?: number | null, _import?: function }} options
 * @returns {Promise<object>}
 */
export async function launchEngine(engine, options = {}) {
	const headless = options.headless === true;
	const cdpPort = normalizePort(options.cdpPort);
	const _import = options._import || importModule;

	if (engine === "playwright") {
		return await launchPlaywright({ headless, cdpPort, _import });
	}

	if (engine === "puppeteer") {
		return await launchPuppeteer({ headless, cdpPort, _import });
	}

	throw new Error(`Unknown engine: ${engine}`);
}
