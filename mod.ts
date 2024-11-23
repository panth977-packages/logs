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
import { ensureFileSync, existsSync } from "@std/fs";

/**
 * Stringify your logs to console.log output string.
 * @param forEachLine add the options prefix for each line or each log
 * @param options add prefix options
 * @returns logging function with a prefix option.
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
export function createStringifyLogger(
  forEachLine: boolean,
  options: { addPrefix?: string; addTs?: "epoch" | "iso" } = {}
) {
  return function (prefix: string | null, args: unknown[]) {
    let logs = [util.format(...args)];
    if (forEachLine) logs = logs[0].split("\n");
    if (options.addPrefix)
      logs = logs.map((x) => util.format(options.addPrefix, x));
    if (prefix) logs = logs.map((x) => util.format(prefix, x));
    if (options.addTs === "epoch") {
      const epoch = Math.floor(Date.now() / 1000);
      logs = logs.map((x) => util.format(epoch, x));
    } else if (options.addTs === "iso") {
      const iso = new Date().toISOString();
      logs = logs.map((x) => util.format(iso, x));
    }
    return logs.join("\n");
  };
}

/**
 *
 * @param filepath target file to stream logs to
 * @param options add logs ttl or file expiry
 * @param separator
 * @returns logger function to push your logs to file.
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
export function createFileLogger(
  filepath: string,
  options: { expireDuration?: number; ttl?: number } = {},
  separator = "\n"
) {
  ensureFileSync(filepath);

  const file = Deno.openSync(filepath, {
    write: true,
    append: true,
    create: true,
  });
  const writer = file.writable.getWriter();
  const encoder = new TextEncoder();

  async function appendLog(log: string): Promise<void> {
    const data = encoder.encode(log + separator);
    await writer.write(data);
  }

  async function onInterval() {
    if (!existsSync(filepath)) return;

    const currentTime = Date.now();
    await appendLog(` ---------- TIMESTAMP: ${currentTime} ---------- `);

    const expiryTimestamp = Date.now() - (options.ttl || 0) * 1000;
    const content = await Deno.readTextFile(filepath);

    let chunk = content;
    const regex = /---------- TIMESTAMP: (\d+) ----------/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const timestamp = parseInt(match[1], 10);
      if (timestamp > expiryTimestamp) {
        chunk = content.substring(match.index);
        break;
      }
    }

    await Deno.writeTextFile(filepath, chunk);
  }

  if (options.expireDuration && existsSync(filepath)) {
    const stat = Deno.statSync(filepath);
    const birthtime =
      stat.birthtime?.getTime() ?? stat.mtime?.getTime() ?? Date.now();
    const life = (Date.now() - birthtime) / 1000;
    if (life > options.expireDuration) {
      Deno.removeSync(filepath);
    }
  }

  let intervalId: number | undefined;
  if (options.ttl) {
    intervalId = setInterval(() => {
      onInterval().catch(console.error);
    }, 60 * 1000);
    onInterval().catch(console.error);
  }

  return Object.assign(appendLog, {
    dispose: async () => {
      if (intervalId) clearInterval(intervalId);
      await writer.close();
      file.close();
    },
  });
}
