import * as puppeteer from "puppeteer";
import { ConsoleMessage, PuppeteerLifeCycleEvent } from "puppeteer";
import { JsonLogger, LogLevels } from "./json-logger.service";
import { config } from "../config";
import { Injectable } from "@nestjs/common";
import { LeakedRequests } from "../models/LeakedRequests";
import { activeRenderGauge, renderErrorCounter, renderDurationHistogram } from "../controllers/metrics/metrics.controller";

// Singleton browser instance
let browser: puppeteer.Browser | null = null;
async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox"],
            timeout: config.navTimeout,
        });
    }
    return browser;
}

// Простая очередь на Promise с ограничением concurrency
const queue: (() => Promise<any>)[] = [];
let active = 0;
const MAX_CONCURRENCY = 10;

function runQueue() {
    if (active >= MAX_CONCURRENCY || queue.length === 0) return;
    const task = queue.shift();
    if (task) {
        active++;
        task().finally(() => {
            active--;
            runQueue();
        });
    }
}

function addToQueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        queue.push(() => fn().then(resolve, reject));
        runQueue();
    });
}

@Injectable()
export class PrerenderService {
    public constructor(private readonly logger: JsonLogger) {}

    public async render(url: string, headers: Headers) {
        return addToQueue(() => this._renderWithMetrics(url, headers));
    }

    private async _renderWithMetrics(url: string, headers: Headers) {
        activeRenderGauge.inc();
        const end = renderDurationHistogram.startTimer();
        try {
            const result = await this._render(url, headers);
            end();
            return result;
        } catch (error) {
            renderErrorCounter.inc();
            end();
            throw error;
        } finally {
            activeRenderGauge.dec();
        }
    }

    private async _render(url: string, headers: Headers) {
        let page: puppeteer.Page | null = null;
        let requests: LeakedRequests[] = [];
        try {
            const browser = await getBrowser();
            page = await browser.newPage();
            await page.setViewport({ width: 360, height: 640 });
            await page.setCacheEnabled(false);
            await page.evaluateOnNewDocument(
                (data) => {
                    Reflect.set(window, "prerender", data);
                },
                {
                    userAgent: headers["user-agent"],
                },
            );

            page.setDefaultNavigationTimeout(config.navTimeout);
            page.setDefaultTimeout(config.defaultTimeout);
            await this.setAuth(page, url);
            this.setLogOnConsole(page);
            requests = await this.setRequestLeakDetector(page);

            await page.goto(url, {
                waitUntil: config.waitUntil as PuppeteerLifeCycleEvent,
                timeout: config.navTimeout,
            });
            await page.addStyleTag({ path: 'styles-445TP4L3.css' });

            const pageContent = await page.content();

            const statusCode = await page.evaluate(() => {
                return document.head
                    ?.querySelector('meta[name="prerender-status"]')
                    ?.getAttribute("content");
            });

            return {
                statusCode,
                pageContent,
            };
        } catch (error) {
            this.checkAndLogLeakedRequests(requests, error);
            this.logger.error(`Render error: ${error}`);
            throw error;
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (e) {
                    this.logger.warn(`Error closing page: ${e}`);
                }
            }
        }
    }

    private async setAuth(page: puppeteer.Page, url: string): Promise<void> {
        if (config.basicAuth) {
            const basicAuths: [string, string, string][] = config.basicAuth
                .split(",")
                .map((auth: string) => {
                    const parts = auth.trim().split(":");
                    return [decodeURIComponent(parts[0]), parts[1], parts[2]];
                });
            for (const auth of basicAuths) {
                if (url.startsWith(auth[0])) {
                    await page.authenticate({
                        username: auth[1],
                        password: auth[2],
                    });
                    break;
                }
            }
        }
    }

    private setLogOnConsole(page: puppeteer.Page): void {
        page.on("console", (msg: ConsoleMessage) => {
            let level = 10;
            const type = msg.type();
            if (type === "log") {
                level = 30;
            } else if (type === "debug") {
                level = 20;
            } else if (type === "info") {
                level = 30;
            } else if (type === "error") {
                level = 50;
            } else if (type === "warn") {
                level = 40;
            } else if (type === "verbose") {
                level = 10;
            }
            this.logger.extraLogs(`Browser log: ${msg.text()}`, level, {
                stack: msg.stackTrace() ?? void 0,
                location: msg.location() ?? void 0,
                args: msg.args() ?? void 0,
            });
        });
    }

    private async setRequestLeakDetector(
        page: puppeteer.Page,
    ): Promise<LeakedRequests[]> {
        const requests: LeakedRequests[] = [];
        await page.setRequestInterception(true);
        page.on("request", (request: puppeteer.HTTPRequest) => {
            const leakedRequest = new LeakedRequests();
            leakedRequest.url = request.url();
            leakedRequest.startTime = Date.now();
            requests.push(leakedRequest);
            request.continue();
        });
        page.on("requestfinished", (request: puppeteer.HTTPRequest) => {
            const url = request.url();
            const index = requests.findIndex((lreq) => lreq.url === url);
            requests.splice(index, 1);
        });
        page.on("requestfailed", (request: puppeteer.HTTPRequest) => {
            const url = request.url();
            const index = requests.findIndex((lreq) => lreq.url === url);
            requests.splice(index, 1);
        });
        return requests;
    }

    private checkAndLogLeakedRequests(
        requests: LeakedRequests[],
        error: unknown,
    ) {
        if (
            error instanceof Error &&
            error.message.startsWith("Navigation timeout")
        ) {
            requests.forEach((lreq) => {
                lreq.endTime = Date.now();
                lreq.time = lreq.endTime - lreq.startTime;
            });
            this.logger.extraLogs(`Leaked requests`, LogLevels.ОШИБКА, {
                requests: requests,
            });
        }
    }
}