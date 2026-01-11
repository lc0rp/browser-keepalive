export async function launchEngine(engine, options = {}) {
	const headless = options.headless === true;
	const cdpPort = normalizePort(options.cdpPort);

	if (engine === "playwright") {
		return await launchPlaywright({ headless, cdpPort });
	}

	if (engine === "puppeteer") {
		return await launchPuppeteer({ headless, cdpPort });
	}

	throw new Error(`Unknown engine: ${engine}`);
}

async function launchPlaywright({ headless, cdpPort }) {
	let mod;
	try {
		mod = await import("playwright");
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

	return {
		engine: "playwright",
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

async function launchPuppeteer({ headless, cdpPort }) {
	let mod;
	try {
		mod = await import("puppeteer");
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

	return {
		engine: "puppeteer",
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

function buildChromiumArgs({ cdpPort }) {
	const args = [];
	if (cdpPort) {
		args.push(`--remote-debugging-port=${cdpPort}`);
		args.push("--remote-debugging-address=127.0.0.1");
	}
	return args;
}

function normalizePort(value) {
	if (value === undefined || value === null) {
		return null;
	}
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0 || n > 65535) {
		throw new Error(`Invalid CDP port: ${String(value)}`);
	}
	return n;
}

function withCause(message, err) {
	if (err instanceof Error && err.message) {
		return `${message}\nCause: ${err.message}`;
	}
	return message;
}
