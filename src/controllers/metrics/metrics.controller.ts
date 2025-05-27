import { Controller, Response, Get } from "@nestjs/common";
import { Response as EResponse } from "express";
import { collectDefaultMetrics, Registry, Gauge, Counter, Histogram } from "prom-client";

const register = new Registry();
collectDefaultMetrics({
    register: register,
    eventLoopMonitoringPrecision: 100,
});

// Кастомные метрики
export const activeRenderGauge = new Gauge({
    name: "botview_active_render_jobs",
    help: "Текущее количество активных задач рендера",
    registers: [register],
});
export const renderErrorCounter = new Counter({
    name: "botview_render_errors_total",
    help: "Количество ошибок рендера",
    registers: [register],
});
export const renderDurationHistogram = new Histogram({
    name: "botview_render_duration_seconds",
    help: "Время рендера страницы (сек)",
    buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
    registers: [register],
});

@Controller("metrics")
export class MetricsController {
    @Get()
    public async getMetrics(@Response() response: EResponse) {
        return response
            .set("Content-Type", register.contentType)
            .send(await register.metrics());
    }
}
