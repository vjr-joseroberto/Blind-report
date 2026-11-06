// Relayer entry point. Usage (from the repository root): node --env-file=.env --import tsx apps/relayer/src/main.ts
import { composeRelayer, stdoutLogger } from "./compose.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { createHttpServer } from "./server.ts";

const SIX_HOURS = 6 * 3600 * 1000;

try {
  const config = loadConfig(process.env);
  const { app, renewal } = composeRelayer(config);
  const server = await createHttpServer({ handler: app, maxBodyBytes: config.maxBodyBytes, host: config.host, port: config.port });
  if (config.simulateWorld) stdoutLogger.error({ event: "WARNING: SIMULATED World verifier (local tests only)" });
  stdoutLogger.info({ event: "listening", port: server.port, environment: config.environment, newsrooms: config.newsrooms.length });

  const tick = () => renewal.run().catch(() => stdoutLogger.error({ job: "renewal", event: "general failure" }));
  void tick();
  const timer = setInterval(tick, SIX_HOURS);

  const stop = async () => {
    clearInterval(timer);
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (e) {
  if (e instanceof ConfigError) {
    process.stderr.write(e.message + "\n"); // only variable names, never values
    process.exit(1);
  }
  process.stderr.write("Failed to start the relayer.\n");
  process.exit(1);
}
