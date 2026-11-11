import app from "./app";
import { logger } from "./lib/logger";

// Vercel discovers the default Express export and runs it as a Function.
// Replit/local development can still launch the HTTP listener with PORT.
export default app;

if (!process.env.VERCEL) {
  const rawPort = process.env.PORT;
  if (!rawPort) {
    throw new Error("PORT environment variable is required for local server startup.");
  }
  const port = Number(rawPort);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}
