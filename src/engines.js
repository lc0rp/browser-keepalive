export async function launchEngine(engine, options = {}) {
	const headless = options.headless === true;

	if (engine === "playwright") {
		return await launchPlaywright({ headless });
	}

	if (engine === "puppeteer") {
		return await launchPuppeteer({ headless });
	}

	throw new Error(`Unknown engine: ${engine}`);
}

async function launchPlaywright({ headless }) {
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

	const browser = await chromium.launch({ headless });
	const context = await browser.newContext();
	const page = await context.newPage();

	return {
		engine: "playwright",
		page,
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

async function launchPuppeteer({ headless }) {
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

	const browser = await puppeteer.launch({ headless });
	const page = await browser.newPage();

	return {
		engine: "puppeteer",
		page,
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

function withCause(message, err) {
	if (err instanceof Error && err.message) {
		return `${message}\nCause: ${err.message}`;
	}
	return message;
}
