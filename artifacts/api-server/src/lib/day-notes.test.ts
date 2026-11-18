import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { ZodError } from "zod";
import { and, eq } from "drizzle-orm";
import { db, dayNotes, pool } from "@workspace/db";
import { ListDayNotesResponse, SaveDayNoteResponse } from "@workspace/api-zod";
import dayNotesRouter from "../routes/edge-day-notes";
import { AuthFailure, privateSessionMiddleware } from "./private-auth";

test("daily reflections persist, validate dates and isolate every owner operation", async (t) => {
  const ownerA = `notes-test-${randomUUID()}`, ownerB = `notes-test-${randomUUID()}`;
  const app = express();
  app.use(express.json());
  // Test-only identities. Production uses the Supabase verifier and its exact owner allowlist.
  app.use(privateSessionMiddleware(async (authorization) => {
    if (authorization === "Bearer owner-a") return { id: ownerA };
    if (authorization === "Bearer owner-b") return { id: ownerB };
    throw new AuthFailure(401, "Unauthorized");
  }));
  app.use(dayNotesRouter);
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err instanceof ZodError ? 400 : err.status ?? 500).json({ error: err.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = (path: string, method = "GET", data?: unknown, token = "owner-a") =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const range = "/day-notes?from=2026-11-01&to=2026-11-30";
  const path = "/day-notes/2026-11-17";
  const good = { wentWell: "Waited for my setup.\nStayed patient.", wentBadly: "Moved my stop too early." };
  try {
    await t.test("all operations require authentication", async () => {
      assert.equal((await request(range, "GET", undefined, "")).status, 401);
      assert.equal((await request(path, "PUT", good, "")).status, 401);
      assert.equal((await request(path, "DELETE", undefined, "")).status, 401);
      assert.equal((await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA))).length, 0);
    });
    await t.test("save without any trades or accounts; reload preserves date and multiline text", async () => {
      const saved = await request(path, "PUT", good);
      assert.equal(saved.status, 200, await saved.clone().text());
      const raw = await saved.json();
      const row = SaveDayNoteResponse.parse(raw);
      assert.equal(row.day, "2026-11-17");
      assert.equal(row.wentWell, good.wentWell);
      assert.equal(row.wentBadly, good.wentBadly);
      assert.equal("ownerId" in (raw as object), false);
      const fresh = await request(range);
      assert.equal(fresh.status, 200);
      assert.deepEqual(ListDayNotesResponse.parse(await fresh.json()), [row]);
    });
    await t.test("same date is unique per owner, edits replace instead of duplicating", async () => {
      const edited = await request(path, "PUT", { ...good, wentBadly: "" });
      assert.equal(edited.status, 200);
      assert.equal(SaveDayNoteResponse.parse(await edited.json()).wentBadly, "");
      const rows = await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.wentBadly, "");
    });
    await t.test("other owner cannot read, change or remove the first owner's note", async () => {
      assert.deepEqual(await (await request(range, "GET", undefined, "owner-b")).json(), []);
      const before = await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA));
      // A forged owner field is rejected, never used to determine ownership.
      assert.equal((await request(path, "PUT", { ...good, ownerId: ownerA }, "owner-b")).status, 400);
      assert.equal((await request(path, "DELETE", undefined, "owner-b")).status, 204);
      assert.deepEqual(await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA)), before);
      assert.equal((await request(path, "PUT", { wentWell: "B's independent note", wentBadly: "" }, "owner-b")).status, 200);
      assert.deepEqual(await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA)), before);
      assert.equal((await request(path, "DELETE", undefined, "owner-b")).status, 204);
      assert.deepEqual(await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA)), before);
    });
    await t.test("invalid dates, ranges, oversized or blank notes cannot change saved data", async () => {
      const before = await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA));
      for (const date of ["2026-02-30", "2026-13-01", "0000-01-01", "bad-date"]) {
        assert.equal((await request(`/day-notes/${date}`, "PUT", good)).status, 400);
        assert.equal((await request(`/day-notes/${date}`, "DELETE")).status, 400);
      }
      for (const query of [
        "?from=2026-02-30&to=2026-03-30", "?from=2026-11-30&to=2026-11-01",
        "?from=2020-01-01&to=2026-11-30", "?from=2026-11-01",
      ]) assert.equal((await request(`/day-notes${query}`)).status, 400);
      for (const data of [
        { wentWell: " ", wentBadly: "\n" }, { wentWell: "x".repeat(10001), wentBadly: "" },
        { wentWell: 42, wentBadly: "" }, { wentWell: "Missing field" },
      ]) assert.equal((await request(path, "PUT", data)).status, 400);
      assert.deepEqual(await db.select().from(dayNotes).where(eq(dayNotes.ownerId, ownerA)), before);
    });
    await t.test("inclusive date ranges, leap day and deletion persist", async () => {
      assert.equal((await request("/day-notes/2024-02-29", "PUT", good)).status, 200);
      assert.equal(ListDayNotesResponse.parse(await (await request("/day-notes?from=2024-02-29&to=2024-02-29")).json()).length, 1);
      assert.equal(ListDayNotesResponse.parse(await (await request(range)).json()).length, 1);
      assert.equal((await request(path, "DELETE")).status, 204);
      assert.deepEqual(await (await request(range)).json(), []);
      assert.equal((await db.select().from(dayNotes).where(and(eq(dayNotes.ownerId, ownerA), eq(dayNotes.day, "2026-11-17")))).length, 0);
    });
  } finally {
    await db.delete(dayNotes).where(eq(dayNotes.ownerId, ownerA));
    await db.delete(dayNotes).where(eq(dayNotes.ownerId, ownerB));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});
