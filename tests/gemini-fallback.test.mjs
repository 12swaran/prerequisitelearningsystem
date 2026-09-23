import assert from "node:assert/strict";
import { test } from "node:test";
import { generateWithFallback } from "../src/lib/langgraph.ts";

function apiError(status) {
  return Object.assign(new Error(`Gemini HTTP ${status}`), { status });
}

test("503 on Flash falls back to the distinct Flash-Lite model", async () => {
  const models = [];
  const ai = {
    models: {
      async generateContent({ model }) {
        models.push(model);
        if (model === "gemini-3.5-flash") throw apiError(503);
        return { text: '{"prerequisites":["Variables"]}' };
      },
    },
  };

  const result = await generateWithFallback(ai, "Teach Python", {});
  assert.match(result, /Variables/);
  assert.deepEqual(models, ["gemini-3.5-flash", "gemini-3.5-flash-lite"]);
});

test("persistent 503 is bounded and shown as a readable message", async () => {
  let calls = 0;
  const ai = { models: { async generateContent() { calls++; throw apiError(503); } } };

  await assert.rejects(generateWithFallback(ai, "Teach Python", {}), /Gemini is temporarily busy/);
  assert.equal(calls, 4);
});

test("invalid API credentials do not trigger repeated requests", async () => {
  let calls = 0;
  const ai = { models: { async generateContent() { calls++; throw apiError(403); } } };

  await assert.rejects(generateWithFallback(ai, "Teach Python", {}), /Gemini HTTP 403/);
  assert.equal(calls, 1);
});
