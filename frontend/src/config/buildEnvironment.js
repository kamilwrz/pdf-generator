import { resolveApiBaseUrl } from "./appConfig.js";

/**
 * Enforce configuration that must fail before a production bundle is emitted.
 *
 * Development and non-build commands retain the same-origin `/api` fallback.
 * A production build, however, must name an explicit HTTPS backend because the
 * Vite development proxy is unavailable in the emitted static application.
 *
 * @param {{command: string, mode: string, env?: Record<string, unknown>}} config
 * @returns {void}
 * @throws {Error} When a production build lacks a valid HTTPS API origin.
 */
export function assertBuildEnvironment({ command, mode, env = {} }) {
  if (command !== "build" || mode !== "production") return;
  resolveApiBaseUrl({ ...env, MODE: mode, PROD: true });
}
