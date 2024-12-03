/**
 * Simple logging function tools, to make like a bit easier.
 * - {@link createStringifyLogger}
 * - {@link createFileLogger}
 *
 * @module
 *
 * @example
 * ```ts
 * import { createFileLogger, createStringifyLogger } from "@panth977/logs";
 * import { FUNCTIONS } from "@panth977/functions";
 *
 * const stringifyLogs = createStringifyLogger(false, { addTs: 'iso' });
 * const fileLogger = createFileLogger('path/to/your/debug.log', { ttl: 60 * 60 });
 * FUNCTIONS.DefaultBuildContext.addLogger(function (context, args) {
 *   try {
 *       fileLogger(stringifyLogs(context.id, args));
 *   } catch (err) {
 *       originalConsole.error(err);
 *   }
 * });
 * ```
 */
import util from "util";
import * as fs from "fs";

/**
 * Stringify your logs to console.log output string.
 *
 * @example
 * ```ts
 * const stringifyLogs = createStringifyLogger(false, { addTs: 'iso' });
 * stringifyLogs('array', [0, 1, 2]) // '2024-11-23T11:21:18.845Z array [0, 1, 2]'
 * stringifyLogs(null, error) // '2024-11-23T11:21:18.845Z Error: MyFault
 *    // at myFunction (/Users/panth977/Dev/npm-package/@panth977/logs/a.js:2:11)
 *    // at main (/Users/panth977/Dev/npm-package/@panth977/logs/a.js:6:5)
 *    // ...stack'
 * ```
 */
export function createStringifyLogger({
  forEachLine,
  addPrefix,
  addTs,
}: {
  forEachLine: boolean;
  addPrefix?: string;
  addTs?: "epoch" | "iso";
}): (prefix: string | null, args: unknown[]) => string {
  return function (prefix: string | null, args: unknown[]) {
    let logs = [util.format(...args)];
    if (forEachLine) logs = logs[0].split("\n");
    if (addPrefix)
      logs = logs.map((x) => util.format(addPrefix, x));
    if (prefix) logs = logs.map((x) => util.format(prefix, x));
    if (addTs === "epoch") {
      const epoch = Math.floor(Date.now() / 1000);
      logs = logs.map((x) => util.format(epoch, x));
    } else if (addTs === "iso") {
      const iso = new Date().toISOString();
      logs = logs.map((x) => util.format(iso, x));
    }
    return logs.join("\n");
  };
}

/**
 * Store logs to a file
 *
 * @example
 * ```ts
 * const fileLogger = createFileLogger('path/to/your/debug.log', { ttl: 60 * 60 });
 * fileLogger('log1');
 * fileLogger('log2');
 * // path/to/your/debug.log
 * log1
 * log2
 * ```
 */
export function createFileLogger({
  filepath,
  separator = "\n",
  expireDuration,
  ttl,
}: {
  filepath: string;
  expireDuration?: number;
  ttl?: number;
  separator?: string;
}): ((log: string) => void) & {
  dispose: () => void;
} {
  const logWriteStream = fs.createWriteStream(filepath, { flags: "a" });
  function appendLog(log: string) {
    logWriteStream.write(log + separator);
  }
  logWriteStream;
  function onInterval() {
    try {
      if (!fs.existsSync(filepath)) return;
      const currentTime = Date.now();
      appendLog(` ---------- TIMESTAMP: ${currentTime} ---------- `);
      const expiryTimestamp = Date.now() - (ttl || 0) * 1000;
      let chunk = fs.readFileSync(filepath).toString();
      let match;
      while (
        (match = /---------- TIMESTAMP: (\d+) ----------/g.exec(chunk)) !== null
      ) {
        const timestamp = parseInt(match[1], 10);
        if (timestamp > expiryTimestamp) {
          chunk = chunk.substring(match.index);
          break;
        } else {
          chunk = chunk.substring(match.index + match[0].length);
        }
      }
      fs.writeFileSync(filepath, chunk);
    } catch (err) {
      console.error(err);
    }
  }
  function dispose() {
    return new Promise<void>((res, rej) => {
      logWriteStream.close(function (err: unknown) {
        if (err === null) {
          res();
        } else {
          rej(err);
        }
      });
    });
  }
  if (expireDuration && fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    const life = (Date.now() - stats.birthtime.getTime()) / 1000;
    if (life > expireDuration) {
      fs.rmSync(filepath);
    }
  }
  if (ttl) {
    setInterval(onInterval, 60 * 1000);
    onInterval();
  }
  return Object.assign(appendLog, { dispose });
}
