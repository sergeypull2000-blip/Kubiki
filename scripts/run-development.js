import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function validateLocalDevelopmentEnv(env = process.env) {
  if (env.NODE_ENV !== "development") {
    throw new Error("Local development requires NODE_ENV=development");
  }
  if (env.KUBIKI_REMOTE_ENV !== "staging") {
    throw new Error("Local development requires KUBIKI_REMOTE_ENV=staging; production services are not allowed");
  }
}

export function runDevelopment({ env = process.env, spawnProcess = spawn } = {}) {
  validateLocalDevelopmentEnv(env);
  const viteEntry = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
  const children = [
    ["server/index.js"],
    [viteEntry],
  ].map((args) =>
    spawnProcess(process.execPath, args, { env, stdio: "inherit" }),
  );

  let stopping = false;
  const stop = (signal = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
  };

  for (const child of children) {
    child.once("error", (error) => {
      console.error("Development process failed to start", { name: error?.name || "Error" });
      process.exitCode = 1;
      stop();
    });
    child.once("exit", (code, signal) => {
      if (!stopping) {
        if (code !== 0 || signal) process.exitCode = code || 1;
        stop();
      }
    });
  }

  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  return { children, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runDevelopment();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
