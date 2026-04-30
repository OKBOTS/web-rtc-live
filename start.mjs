#!/usr/bin/env node
/**
 * Optional single-command runner for Airwave.
 *
 * Starts both the API server and the broadcast frontend in one process,
 * with colour-coded, prefixed output for each service.
 *
 * REQUIREMENTS: both packages must be built before running.
 * Builds automatically if dist files are missing.
 * Force a rebuild with -b or BUILD=1.
 *
 * Usage:
 *   node start.mjs          # auto-builds if needed, then starts
 *   node start.mjs -b       # always rebuild, then start
 *   BUILD=1 node start.mjs  # same via env var
 *
 * Environment variables:
 *   API_PORT   Port for the API server           (default: 8080)
 *   PORT       Port for the broadcast frontend   (default: 3000)
 *   BASE_PATH  Base path for the frontend        (default: /)
 *
 * NOTE: The primary dev workflow (pnpm dev / Replit workflows) is unchanged.
 *       This script is an optional production-style launcher only.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;

const API_PORT  = process.env.API_PORT  ?? "8080";
const WEB_PORT  = process.env.PORT      ?? "3000";
const BASE_PATH = process.env.BASE_PATH ?? "/";

const apiDist = resolve(ROOT, "artifacts/api-server/dist/index.mjs");
const webDist = resolve(ROOT, "artifacts/broadcast/dist");

const nodeModules = resolve(ROOT, "node_modules");

// Auto-build if deps or dist are missing, or when explicitly requested
const SHOULD_BUILD =
  process.argv.includes("-b") ||
  process.env.BUILD === "1" ||
  !existsSync(nodeModules) ||
  !existsSync(apiDist) ||
  !existsSync(webDist);

// ANSI colour codes
const RESET  = "\x1b[0m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const DIM    = "\x1b[2m";

function log(label, color, msg) {
  const lines = msg.toString().replace(/\n$/, "").split("\n");
  for (const line of lines) {
    if (line.trim()) process.stdout.write(`${color}[${label}]${RESET} ${line}\n`);
  }
}

function runSync(label, color, cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    log(label, color, `> ${cmd} ${args.join(" ")}`);
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", (d) => log(label, color, d));
    proc.stderr.on("data", (d) => log(label, color, d));
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} build failed (exit ${code})`));
    });
  });
}

function spawnService(label, color, cmd, args, env = {}) {
  log(label, color, `Starting…`);
  const proc = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (d) => log(label, color, d));
  proc.stderr.on("data", (d) => log(label, color, d));
  proc.on("exit", (code) => {
    log(label, RED, `exited with code ${code ?? "?"}`);
    process.exit(code ?? 1);
  });
  return proc;
}

async function main() {
  console.log(`\n${GREEN}▶ Airwave combined launcher${RESET} ${DIM}(optional runner — primary dev workflow unchanged)${RESET}\n`);

  // ── Optional build step ──────────────────────────────────────────────────
  if (SHOULD_BUILD) {
    console.log(`${DIM}Installing dependencies…${RESET}\n`);
    await runSync("INSTALL", GREEN, "pnpm", ["install", "--frozen-lockfile"]);

    console.log(`\n${DIM}Building packages…${RESET}\n`);
    await runSync("BUILD:api", YELLOW, "pnpm", [
      "--filter", "@workspace/api-server", "run", "build",
    ]);
    await runSync("BUILD:web", CYAN, "pnpm", [
      "--filter", "@workspace/broadcast", "run", "build",
    ]);
    console.log(`\n${GREEN}✓ Build complete${RESET}\n`);
  }

  // ── Spawn services ───────────────────────────────────────────────────────
  const procs = [];

  // API server
  procs.push(spawnService(
    "API", YELLOW,
    "node", ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
    { PORT: API_PORT },
  ));

  // Broadcast frontend (vite preview serves the built static site)
  procs.push(spawnService(
    "WEB", CYAN,
    "pnpm", ["--filter", "@workspace/broadcast", "run", "serve"],
    { PORT: WEB_PORT, BASE_PATH },
  ));

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = (sig) => {
    log("launcher", GREEN, `Received ${sig}, shutting down…`);
    for (const p of procs) p.kill(sig);
  };
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(`${RED}[ERROR]${RESET}`, err.message);
  process.exit(1);
});
