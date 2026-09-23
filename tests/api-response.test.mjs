import assert from "node:assert/strict";
import { test } from "node:test";
import { readApiResponse } from "../src/lib/api-response.ts";

test("an HTML timeout produces a useful error instead of a JSON parse exception", async () => {
  const response = new Response("<HTML><HEAD>Gateway Timeout</HEAD></HTML>", {
    status: 504,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(readApiResponse(response), /could not complete the request \(HTTP 504\)/);
});

test("an HTML response with a success status is rejected", async () => {
  const response = new Response("<HTML><HEAD>Login</HEAD></HTML>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(readApiResponse(response), /returned a page instead of data/);
});

test("JSON API errors remain visible", async () => {
  const response = Response.json({ error: "Missing Gemini API Key" }, { status: 500 });
  await assert.rejects(readApiResponse(response), /Missing Gemini API Key/);
});

test("a valid state is returned", async () => {
  const state = { target_concept: "Python", prerequisites: ["Variables"] };
  assert.deepEqual(await readApiResponse(Response.json({ state })), state);
});
