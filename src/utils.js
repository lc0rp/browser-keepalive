/**
 * Utility functions for browser-keepalive CLI.
 * Extracted for testability.
 */

/**
 * Parse interval value from string to number.
 * @param {string} value
 * @returns {number}
 */
export function parseInterval(value) {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error("--interval must be a positive number of seconds");
	}
	return n;
}

/**
 * Validate engine name.
 * @param {string} value
 * @returns {"playwright" | "puppeteer"}
 */
export function validateEngine(value) {
	if (value !== "playwright" && value !== "puppeteer") {
		throw new Error("--engine must be 'playwright' or 'puppeteer'");
	}
	return value;
}

/**
 * Normalize and validate port number.
 * @param {string | number} value
 * @returns {number}
 */
export function normalizePort(value) {
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0 || n > 65535) {
		throw new Error("--cdp-port must be an integer between 1 and 65535");
	}
	return n;
}

/**
 * Remove a specific query parameter from a URL.
 * @param {string} urlString
 * @param {string} param
 * @returns {string}
 */
export function stripQueryParam(urlString, param) {
	try {
		const url = new URL(urlString);
		url.searchParams.delete(param);
		return url.toString();
	} catch {
		return urlString;
	}
}

/**
 * Add a cache-busting query parameter to a URL.
 * @param {string} urlString
 * @returns {string}
 */
export function withCacheBuster(urlString) {
	const base = stripQueryParam(urlString, "_cb");
	const url = new URL(base);
	url.searchParams.set("_cb", `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
	return url.toString();
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error indicates a missing engine package.
 * @param {unknown} err
 * @param {string} engine
 * @returns {boolean}
 */
export function isMissingEngineError(err, engine) {
	const message = err instanceof Error ? err.message : String(err);
	return message.includes(`Cannot find package '${engine}'`) || message.includes(`Failed to import '${engine}'`);
}

/**
 * Check if an error indicates missing Playwright browser binaries.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isPlaywrightMissingBrowserError(err) {
	const message = err instanceof Error ? err.message : String(err);
	const m = message.toLowerCase();
	return (
		m.includes("playwright") &&
		(m.includes("executable doesn't exist") ||
			m.includes("executable doesnt exist") ||
			m.includes("playwright install"))
	);
}
