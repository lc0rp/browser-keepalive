import { describe, it, expect, vi } from "vitest";
import {
	normalizePort,
	buildChromiumArgs,
	withCause,
	createSession,
	importModule,
	launchPlaywright,
	launchPuppeteer,
	launchEngine,
} from "../src/engines.js";

describe("normalizePort", () => {
	it("returns null for undefined", () => {
		expect(normalizePort(undefined)).toBe(null);
	});

	it("returns null for null", () => {
		expect(normalizePort(null)).toBe(null);
	});

	it("parses valid port numbers", () => {
		expect(normalizePort(8080)).toBe(8080);
		expect(normalizePort("9222")).toBe(9222);
		expect(normalizePort(1)).toBe(1);
		expect(normalizePort(65535)).toBe(65535);
	});

	it("throws on zero", () => {
		expect(() => normalizePort(0)).toThrow("CDP port must be an integer between 1 and 65535");
	});

	it("throws on negative", () => {
		expect(() => normalizePort(-1)).toThrow("CDP port must be an integer between 1 and 65535");
	});

	it("throws on > 65535", () => {
		expect(() => normalizePort(65536)).toThrow("CDP port must be an integer between 1 and 65535");
	});

	it("throws on non-integer", () => {
		expect(() => normalizePort(8080.5)).toThrow("CDP port must be an integer between 1 and 65535");
	});

	it("throws on NaN string", () => {
		expect(() => normalizePort("abc")).toThrow("CDP port must be an integer between 1 and 65535");
	});
});

describe("buildChromiumArgs", () => {
	it("returns empty array when no cdpPort", () => {
		expect(buildChromiumArgs({ cdpPort: null })).toEqual([]);
	});

	it("returns CDP args when port specified", () => {
		const args = buildChromiumArgs({ cdpPort: 9222 });
		expect(args).toContain("--remote-debugging-port=9222");
		expect(args).toContain("--remote-debugging-address=127.0.0.1");
	});

	it("uses correct port number", () => {
		const args = buildChromiumArgs({ cdpPort: 8888 });
		expect(args).toContain("--remote-debugging-port=8888");
	});
});

describe("withCause", () => {
	it("appends Error cause", () => {
		const err = new Error("Root cause");
		const result = withCause("Something failed", err);
		expect(result).toBe("Something failed\nCause: Root cause");
	});

	it("returns message only for non-Error", () => {
		const result = withCause("Something failed", "not an error");
		expect(result).toBe("Something failed");
	});

	it("returns message only for Error without message", () => {
		const err = new Error();
		err.message = "";
		const result = withCause("Something failed", err);
		expect(result).toBe("Something failed");
	});

	it("handles null", () => {
		const result = withCause("Something failed", null);
		expect(result).toBe("Something failed");
	});

	it("handles undefined", () => {
		const result = withCause("Something failed", undefined);
		expect(result).toBe("Something failed");
	});
});

describe("createSession", () => {
	it("creates session with correct engine name", () => {
		const page = { goto: vi.fn(), reload: vi.fn(), url: vi.fn() };
		const browser = { close: vi.fn() };
		const session = createSession("playwright", page, browser, 9222);

		expect(session.engine).toBe("playwright");
		expect(session.cdpPort).toBe(9222);
	});

	it("exposes page reference", () => {
		const page = { goto: vi.fn(), reload: vi.fn(), url: vi.fn() };
		const browser = { close: vi.fn() };
		const session = createSession("puppeteer", page, browser, null);

		expect(session.page).toBe(page);
	});

	it("close() calls browser.close()", async () => {
		const page = { goto: vi.fn(), reload: vi.fn(), url: vi.fn() };
		const browser = { close: vi.fn().mockResolvedValue(undefined) };
		const session = createSession("playwright", page, browser, null);

		await session.close();
		expect(browser.close).toHaveBeenCalledOnce();
	});

	it("goto() calls page.goto() with arguments", async () => {
		const page = {
			goto: vi.fn().mockResolvedValue("response"),
			reload: vi.fn(),
			url: vi.fn(),
		};
		const browser = { close: vi.fn() };
		const session = createSession("playwright", page, browser, null);

		const result = await session.goto("https://example.com", { waitUntil: "load" });
		expect(page.goto).toHaveBeenCalledWith("https://example.com", { waitUntil: "load" });
		expect(result).toBe("response");
	});

	it("reload() calls page.reload() with arguments", async () => {
		const page = {
			goto: vi.fn(),
			reload: vi.fn().mockResolvedValue("reloaded"),
			url: vi.fn(),
		};
		const browser = { close: vi.fn() };
		const session = createSession("playwright", page, browser, null);

		const result = await session.reload({ waitUntil: "domcontentloaded" });
		expect(page.reload).toHaveBeenCalledWith({ waitUntil: "domcontentloaded" });
		expect(result).toBe("reloaded");
	});

	it("currentUrl() calls page.url()", async () => {
		const page = {
			goto: vi.fn(),
			reload: vi.fn(),
			url: vi.fn().mockReturnValue("https://current.url"),
		};
		const browser = { close: vi.fn() };
		const session = createSession("playwright", page, browser, null);

		const result = await session.currentUrl();
		expect(page.url).toHaveBeenCalled();
		expect(result).toBe("https://current.url");
	});
});

describe("importModule", () => {
	it("imports node built-in modules", async () => {
		const fs = await importModule("node:fs");
		expect(fs).toBeDefined();
		expect(typeof fs.readFileSync).toBe("function");
	});

	it("throws on non-existent module", async () => {
		await expect(importModule("non-existent-module-xyz")).rejects.toThrow();
	});
});

// Helper to create mock browser
function createMockBrowser() {
	const page = {
		goto: vi.fn().mockResolvedValue(undefined),
		reload: vi.fn().mockResolvedValue(undefined),
		url: vi.fn().mockReturnValue("https://example.com"),
		on: vi.fn(),
	};
	const context = {
		newPage: vi.fn().mockResolvedValue(page),
	};
	const browser = {
		newContext: vi.fn().mockResolvedValue(context),
		newPage: vi.fn().mockResolvedValue(page),
		close: vi.fn().mockResolvedValue(undefined),
	};
	return { page, context, browser };
}

describe("launchPlaywright", () => {
	it("launches browser with correct options", async () => {
		const { page, context, browser } = createMockBrowser();
		const mockImport = vi.fn().mockResolvedValue({
			chromium: {
				launch: vi.fn().mockResolvedValue(browser),
			},
		});

		const session = await launchPlaywright({ headless: true, cdpPort: 9222, _import: mockImport });

		expect(mockImport).toHaveBeenCalledWith("playwright");
		expect(session.engine).toBe("playwright");
		expect(session.cdpPort).toBe(9222);
	});

	it("passes headless option to chromium.launch", async () => {
		const { browser } = createMockBrowser();
		const launchFn = vi.fn().mockResolvedValue(browser);
		const mockImport = vi.fn().mockResolvedValue({
			chromium: { launch: launchFn },
		});

		await launchPlaywright({ headless: true, cdpPort: null, _import: mockImport });

		expect(launchFn).toHaveBeenCalledWith({ headless: true, args: [] });
	});

	it("passes CDP args when cdpPort specified", async () => {
		const { browser } = createMockBrowser();
		const launchFn = vi.fn().mockResolvedValue(browser);
		const mockImport = vi.fn().mockResolvedValue({
			chromium: { launch: launchFn },
		});

		await launchPlaywright({ headless: false, cdpPort: 9222, _import: mockImport });

		expect(launchFn).toHaveBeenCalledWith({
			headless: false,
			args: ["--remote-debugging-port=9222", "--remote-debugging-address=127.0.0.1"],
		});
	});

	it("throws when import fails", async () => {
		const mockImport = vi.fn().mockRejectedValue(new Error("Cannot find package 'playwright'"));

		await expect(launchPlaywright({ headless: false, cdpPort: null, _import: mockImport }))
			.rejects.toThrow("Failed to import 'playwright'");
	});

	it("throws when chromium export missing", async () => {
		const mockImport = vi.fn().mockResolvedValue({});

		await expect(launchPlaywright({ headless: false, cdpPort: null, _import: mockImport }))
			.rejects.toThrow("'playwright' was imported but `chromium` export was not found");
	});
});

describe("launchPuppeteer", () => {
	it("launches browser with correct options", async () => {
		const { page, browser } = createMockBrowser();
		const mockImport = vi.fn().mockResolvedValue({
			default: {
				launch: vi.fn().mockResolvedValue(browser),
			},
		});

		const session = await launchPuppeteer({ headless: false, cdpPort: 8888, _import: mockImport });

		expect(mockImport).toHaveBeenCalledWith("puppeteer");
		expect(session.engine).toBe("puppeteer");
		expect(session.cdpPort).toBe(8888);
	});

	it("passes headless option to puppeteer.launch", async () => {
		const { browser } = createMockBrowser();
		const launchFn = vi.fn().mockResolvedValue(browser);
		const mockImport = vi.fn().mockResolvedValue({
			default: { launch: launchFn },
		});

		await launchPuppeteer({ headless: true, cdpPort: null, _import: mockImport });

		expect(launchFn).toHaveBeenCalledWith({ headless: true, args: [] });
	});

	it("passes CDP args when cdpPort specified", async () => {
		const { browser } = createMockBrowser();
		const launchFn = vi.fn().mockResolvedValue(browser);
		const mockImport = vi.fn().mockResolvedValue({
			default: { launch: launchFn },
		});

		await launchPuppeteer({ headless: false, cdpPort: 3000, _import: mockImport });

		expect(launchFn).toHaveBeenCalledWith({
			headless: false,
			args: ["--remote-debugging-port=3000", "--remote-debugging-address=127.0.0.1"],
		});
	});

	it("handles non-default export", async () => {
		const { browser } = createMockBrowser();
		const mockImport = vi.fn().mockResolvedValue({
			launch: vi.fn().mockResolvedValue(browser),
		});

		const session = await launchPuppeteer({ headless: false, cdpPort: null, _import: mockImport });
		expect(session.engine).toBe("puppeteer");
	});

	it("throws when import fails", async () => {
		const mockImport = vi.fn().mockRejectedValue(new Error("Cannot find package 'puppeteer'"));

		await expect(launchPuppeteer({ headless: false, cdpPort: null, _import: mockImport }))
			.rejects.toThrow("Failed to import 'puppeteer'");
	});

	it("throws when launch function missing", async () => {
		const mockImport = vi.fn().mockResolvedValue({ default: {} });

		await expect(launchPuppeteer({ headless: false, cdpPort: null, _import: mockImport }))
			.rejects.toThrow("'puppeteer' was imported but no `launch()` function was found");
	});
});

describe("launchEngine", () => {
	it("throws on unknown engine", async () => {
		await expect(launchEngine("selenium")).rejects.toThrow("Unknown engine: selenium");
	});

	it("throws on empty engine", async () => {
		await expect(launchEngine("")).rejects.toThrow("Unknown engine: ");
	});

	it("validates cdpPort before launching", async () => {
		await expect(launchEngine("playwright", { cdpPort: 99999 })).rejects.toThrow(
			"CDP port must be an integer between 1 and 65535"
		);
	});

	it("launches playwright when engine is 'playwright'", async () => {
		const { browser } = createMockBrowser();
		const mockImport = vi.fn().mockResolvedValue({
			chromium: { launch: vi.fn().mockResolvedValue(browser) },
		});

		const session = await launchEngine("playwright", { headless: true, _import: mockImport });
		expect(session.engine).toBe("playwright");
		expect(mockImport).toHaveBeenCalledWith("playwright");
	});

	it("launches puppeteer when engine is 'puppeteer'", async () => {
		const { browser } = createMockBrowser();
		const mockImport = vi.fn().mockResolvedValue({
			default: { launch: vi.fn().mockResolvedValue(browser) },
		});

		const session = await launchEngine("puppeteer", { headless: false, _import: mockImport });
		expect(session.engine).toBe("puppeteer");
		expect(mockImport).toHaveBeenCalledWith("puppeteer");
	});

	it("normalizes cdpPort from string", async () => {
		const { browser } = createMockBrowser();
		const launchFn = vi.fn().mockResolvedValue(browser);
		const mockImport = vi.fn().mockResolvedValue({
			chromium: { launch: launchFn },
		});

		await launchEngine("playwright", { cdpPort: "9222", _import: mockImport });

		expect(launchFn).toHaveBeenCalledWith({
			headless: false,
			args: ["--remote-debugging-port=9222", "--remote-debugging-address=127.0.0.1"],
		});
	});

	it("defaults headless to false", async () => {
		const { browser } = createMockBrowser();
		const launchFn = vi.fn().mockResolvedValue(browser);
		const mockImport = vi.fn().mockResolvedValue({
			chromium: { launch: launchFn },
		});

		await launchEngine("playwright", { _import: mockImport });

		expect(launchFn).toHaveBeenCalledWith({ headless: false, args: [] });
	});
});
