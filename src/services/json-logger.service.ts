import { LoggerService } from "@nestjs/common";
import { hostname } from "os";

export enum LogLevels {
    ФАТАЛЬНАЯ = 60,
    ОШИБКА = 50,
    ПРЕДУПРЕЖДЕНИЕ = 40,
    ИНФО = 30,
    ОТЛАДКА = 20,
    ПОДРОБНО = 10,
}

function levelToRussian(level: number): string {
    switch (level) {
        case LogLevels.ФАТАЛЬНАЯ: return "ФАТАЛЬНАЯ";
        case LogLevels.ОШИБКА: return "ОШИБКА";
        case LogLevels.ПРЕДУПРЕЖДЕНИЕ: return "ПРЕДУПРЕЖДЕНИЕ";
        case LogLevels.ИНФО: return "ИНФО";
        case LogLevels.ОТЛАДКА: return "ОТЛАДКА";
        case LogLevels.ПОДРОБНО: return "ПОДРОБНО";
        default: return "ЛОГ";
    }
}

export class JsonLogger implements LoggerService {
    public log(message: any) {
        this.writeJson(message, LogLevels.ИНФО);
    }

    public error(message: any) {
        this.writeJson(message, LogLevels.ОШИБКА);
    }

    public warn(message: any) {
        this.writeJson(message, LogLevels.ПРЕДУПРЕЖДЕНИЕ);
    }

    public debug(message: any) {
        this.writeJson(message, LogLevels.ОТЛАДКА);
    }

    public verbose(message: any) {
        this.writeJson(message, LogLevels.ПОДРОБНО);
    }

    public extraLogs(
        message: any,
        level: number,
        extraProps: object = {},
    ): void {
        this.writeJson(message, level, extraProps);
    }

    protected writeJson(
        message: any,
        level: number,
        extraProps: object = {},
    ): void {
        const now = new Date();
        const logObj: any = {
            "время": now.toLocaleString("ru-RU", { hour12: false }),
            "уровень": levelToRussian(level),
            "сообщение": typeof message === 'string' ? message : JSON.stringify(message, null, 2),
        };
        // Добавляем дополнительные поля, если есть
        for (const [key, value] of Object.entries(extraProps)) {
            logObj[key] = value;
        }
        const logStr = JSON.stringify(logObj, null, 2);
        console.log(logStr);
    }
}
