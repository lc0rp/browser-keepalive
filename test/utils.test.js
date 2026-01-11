import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	parseInterval,
	validateEngine,
	validateUrlString,
	stripQueryParam,
	withCacheBuster,
	sleep,
	isMissingEngineError,
	isPlaywrightMissingBrowserError,
} from "../src/utils.js";

describe("parseInterval", () => {
	it("parses valid positive integers", () => {
		expect(parseInterval("60")).toBe(60);
		expect(parseInterval("1")).toBe(1);
		expect(parseInterval("3600")).toBe(3600);
	});

	it("parses valid positive floats", () => {
		expect(parseInterval("30.5")).toBe(30.5);
		expect(parseInterval("0.5")).toBe(0.5);
	});

	it("throws on zero", () => {
		expect(() => parseInterval("0")).toThrow("--interval must be a positive number");
	});

	it("throws on negative numbers", () => {
		expect(() => parseInterval("-1")).toThrow("--interval must be a positive number");
		expect(() => parseInterval("-60")).toThrow("--interval must be a positive number");
	});

	it("throws on non-numeric strings", () => {
		expect(() => parseInterval("abc")).toThrow("--interval must be a positive number");
		expect(() => parseInterval("")).toThrow("--interval must be a positive number");
	});

	it("throws on Infinity", () => {
		expect(() => parseInterval("Infinity")).toThrow("--interval must be a positive number");
	});

	it("throws on NaN", () => {
		expect(() => parseInterval("NaN")).toThrow("--interval must be a positive number");
	});
});

describe("validateEngine", () => {
	it("accepts 'playwright'", () => {
		expect(validateEngine("playwright")).toBe("playwright");
	});

	it("accepts 'puppeteer'", () => {
		expect(validateEngine("puppeteer")).toBe("puppeteer");
	});

	it("throws on invalid engine names", () => {
		expect(() => validateEngine("selenium")).toThrow("--engine must be 'playwright' or 'puppeteer'");
		expect(() => validateEngine("")).toThrow("--engine must be 'playwright' or 'puppeteer'");
		expect(() => validateEngine("Playwright")).toThrow("--engine must be 'playwright' or 'puppeteer'");
	});
});

describe("validateUrlString", () => {
	it("accepts valid absolute URLs", () => {
		expect(validateUrlString("https://example.com")).toBe("https://example.com/");
		expect(validateUrlString("https://example.com/path?x=1")).toBe("https://example.com/path?x=1");
	});

	it("throws on invalid URLs", () => {
		expect(() => validateUrlString("not-a-url")).toThrow("<url> must be a valid absolute URL");
		expect(() => validateUrlString("")).toThrow("<url> must be a valid absolute URL");
	});
});

describe("stripQueryParam", () => {
	it("removes specified query parameter", () => {
		expect(stripQueryParam("https://example.com?_cb=abc123", "_cb")).toBe("https://example.com/");
		expect(stripQueryParam("https://example.com?foo=bar&_cb=abc", "_cb")).toBe("https://example.com/?foo=bar");
	});

	it("preserves other query parameters", () => {
		expect(stripQueryParam("https://example.com?a=1&_cb=x&b=2", "_cb")).toBe("https://example.com/?a=1&b=2");
	});

	it("returns unchanged URL if param not present", () => {
		expect(stripQueryParam("https://example.com?foo=bar", "_cb")).toBe("https://example.com/?foo=bar");
		expect(stripQueryParam("https://example.com/", "_cb")).toBe("https://example.com/");
	});

	it("handles URLs without query string", () => {
		expect(stripQueryParam("https://example.com", "_cb")).toBe("https://example.com/");
		expect(stripQueryParam("https://example.com/path", "_cb")).toBe("https://example.com/path");
	});

	it("returns original string for invalid URLs", () => {
		expect(stripQueryParam("not-a-url", "_cb")).toBe("not-a-url");
		expect(stripQueryParam("", "_cb")).toBe("");
	});
});

describe("withCacheBuster", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
		vi.spyOn(Math, "random").mockReturnValue(0.123456789);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("adds _cb query parameter", () => {
		const result = withCacheBuster("https://example.com");
		expect(result).toContain("_cb=");
		expect(result).toMatch(/\?_cb=[a-z0-9]+$/);
	});

	it("replaces existing _cb parameter", () => {
		const result = withCacheBuster("https://example.com?_cb=old");
		expect(result).not.toContain("old");
		expect(result).toContain("_cb=");
		// Should only have one _cb
		expect(result.match(/_cb=/g)?.length).toBe(1);
	});

	it("preserves other query parameters", () => {
		const result = withCacheBuster("https://example.com?foo=bar");
		expect(result).toContain("foo=bar");
		expect(result).toContain("_cb=");
	});

	it("generates unique values based on time and random", () => {
		const result = withCacheBuster("https://example.com");
		// With mocked time and random, we can predict the value
		const timestamp = Date.now().toString(36);
		const random = (0.123456789).toString(36).slice(2, 6);
		expect(result).toBe(`https://example.com/?_cb=${timestamp}${random}`);
	});

	it("returns original string for invalid URLs", () => {
		expect(withCacheBuster("not-a-url")).toBe("not-a-url");
	});
});

describe("sleep", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves after specified time", async () => {
		const promise = sleep(1000);
		vi.advanceTimersByTime(999);
		// Should not resolve yet
		let resolved = false;
		promise.then(() => {
			resolved = true;
		});
		await Promise.resolve(); // flush microtasks
		expect(resolved).toBe(false);

		vi.advanceTimersByTime(1);
		await promise;
		expect(resolved).toBe(true);
	});

	it("works with zero milliseconds", async () => {
		const promise = sleep(0);
		vi.advanceTimersByTime(0);
		await promise;
		// Should complete without error
	});
});

describe("isMissingEngineError", () => {
	it("detects 'Cannot find package' errors", () => {
		const err = new Error("Cannot find package 'playwright'");
		expect(isMissingEngineError(err, "playwright")).toBe(true);
	});

	it("detects 'Failed to import' errors", () => {
		const err = new Error("Failed to import 'puppeteer'. Install it first.");
		expect(isMissingEngineError(err, "puppeteer")).toBe(true);
	});

	it("returns false for unrelated errors", () => {
		const err = new Error("Some other error");
		expect(isMissingEngineError(err, "playwright")).toBe(false);
	});

	it("returns false when engine name doesn't match", () => {
		const err = new Error("Cannot find package 'playwright'");
		expect(isMissingEngineError(err, "puppeteer")).toBe(false);
	});

	it("handles non-Error objects", () => {
		expect(isMissingEngineError("Cannot find package 'playwright'", "playwright")).toBe(true);
		expect(isMissingEngineError({ message: "Cannot find package 'playwright'" }, "playwright")).toBe(false);
	});
});

describe("isPlaywrightMissingBrowserError", () => {
	it("detects 'executable doesn\\'t exist' errors", () => {
		const err = new Error("Playwright: executable doesn't exist at /path/to/chromium");
		expect(isPlaywrightMissingBrowserError(err)).toBe(true);
	});

	it("detects 'playwright install' suggestion errors", () => {
		const err = new Error("Run `playwright install` to download browsers");
		expect(isPlaywrightMissingBrowserError(err)).toBe(true);
	});

	it("returns false if playwright not mentioned", () => {
		const err = new Error("executable doesn't exist");
		expect(isPlaywrightMissingBrowserError(err)).toBe(false);
	});

	it("returns false for unrelated playwright errors", () => {
		const err = new Error("Playwright timeout exceeded");
		expect(isPlaywrightMissingBrowserError(err)).toBe(false);
	});

	it("is case-insensitive", () => {
		const err = new Error("PLAYWRIGHT: EXECUTABLE DOESN'T EXIST");
		expect(isPlaywrightMissingBrowserError(err)).toBe(true);
	});

	it("handles non-Error objects", () => {
		expect(isPlaywrightMissingBrowserError("Playwright: executable doesn't exist")).toBe(true);
	});
});
