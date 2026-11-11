import express, { type Express, type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "./lib/edge-data";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
const handleError: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }); return;
  }
  if (err instanceof SyntaxError) { res.status(400).json({ error: "Invalid JSON request." }); return; }
  req.log.error({ errorType: err instanceof Error ? err.name : "UnknownError" }, "Request failed");
  res.status(500).json({ error: "The request could not be completed. Please try again." });
};
app.use(handleError);

export default app;
