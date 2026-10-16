import { test } from "node:test";
import assert from "node:assert/strict";
import { translateV2Event } from "../plugin/pixel-office.js";

test("session.step.started -> tool.execute.before with agent and model", () => {
  const out = translateV2Event({
    type: "session.step.started",
    data: { sessionID: "s1", agent: "build", model: { id: "gpt-5", providerID: "openai" } },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "tool.execute.before");
  assert.equal(out[0].properties.sessionID, "s1");
  assert.equal(out[0].properties.info.agent, "build");
  assert.equal(out[0].properties.info.model.modelID, "gpt-5");
  assert.equal(out[0].properties.info.model.providerID, "openai");
});

test("session.step.started without agent falls back to 'opencode'", () => {
  const out = translateV2Event({ type: "session.step.started", data: { sessionID: "s1" } });
  assert.equal(out[0].properties.info.agent, "opencode");
});

test("session.tool.called -> tool.execute.before carrying tool name", () => {
  const out = translateV2Event({
    type: "session.tool.called",
    data: { sessionID: "s1", assistantMessageID: "m1", id: "t1", name: "bash", input: { cmd: "ls" } },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "tool.execute.before");
  assert.equal(out[0].properties.tool.name, "bash");
  assert.deepEqual(out[0].properties.tool.input, { cmd: "ls" });
});

test("session.tool.success -> tool.execute.after", () => {
  const out = translateV2Event({
    type: "session.tool.success",
    data: { sessionID: "s1", assistantMessageID: "m1", id: "t1", content: [{ type: "text", text: "ok" }] },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "tool.execute.after");
  assert.equal(out[0].properties.sessionID, "s1");
});

test("session.text.delta -> message.part.updated with text part", () => {
  const out = translateV2Event({
    type: "session.text.delta",
    data: { sessionID: "s1", assistantMessageID: "m1", ordinal: 2, delta: "hello" },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "message.part.updated");
  assert.equal(out[0].properties.part.type, "text");
  assert.equal(out[0].properties.part.text, "hello");
  assert.equal(out[0].properties.part.id, "m1:2");
});

test("session.reasoning.delta -> message.part.updated with reasoning part", () => {
  const out = translateV2Event({
    type: "session.reasoning.delta",
    data: { sessionID: "s1", assistantMessageID: "m1", delta: "thinking" },
  });
  assert.equal(out[0].properties.part.type, "reasoning");
});

test("empty delta is dropped", () => {
  assert.deepEqual(translateV2Event({ type: "session.text.delta", data: { sessionID: "s1", delta: "" } }), []);
});

test("session.step.ended with tool-calls finish emits nothing", () => {
  assert.deepEqual(
    translateV2Event({ type: "session.step.ended", data: { sessionID: "s1", finish: "tool-calls" } }),
    [],
  );
});

test("session.step.ended with a terminal finish -> session.idle", () => {
  const out = translateV2Event({ type: "session.step.ended", data: { sessionID: "s1", finish: "stop" } });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "session.idle");
  assert.equal(out[0].properties.sessionID, "s1");
});

test("unknown event type maps to nothing", () => {
  assert.deepEqual(translateV2Event({ type: "catalog.updated", data: {} }), []);
  assert.deepEqual(translateV2Event({}), []);
});

test("session.tool.called reuses agent/model cached from step.started (no phantom agent)", () => {
  const meta = new Map();
  translateV2Event(
    {
      type: "session.step.started",
      data: { sessionID: "s1", agent: "build", model: { id: "gpt-5", providerID: "openai" } },
    },
    meta,
  );
  const out = translateV2Event(
    { type: "session.tool.called", data: { sessionID: "s1", assistantMessageID: "m1", name: "bash" } },
    meta,
  );
  assert.equal(out[0].properties.info.agent, "build");
  assert.equal(out[0].properties.info.model.modelID, "gpt-5");
  assert.equal(out[0].properties.info.model.providerID, "openai");
});

test("session.tool.called without cached agent defaults to 'opencode'", () => {
  const out = translateV2Event(
    { type: "session.tool.called", data: { sessionID: "s1", name: "bash" } },
    new Map(),
  );
  assert.equal(out[0].properties.info.agent, "opencode");
});

test("session.inbox.enqueued (user) -> message.part.updated as boss message", () => {
  const out = translateV2Event({
    type: "session.inbox.enqueued",
    data: { sessionID: "s1", inboxID: "msg1", item: { type: "user", payload: { text: "hello boss", files: [], agents: [] } } },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "message.part.updated");
  assert.equal(out[0].properties.info.role, "user");
  assert.equal(out[0].properties.part.messageID, "msg1");
  assert.equal(out[0].properties.part.text, "hello boss");
});

test("session.inbox.enqueued non-user item is dropped", () => {
  assert.deepEqual(
    translateV2Event({ type: "session.inbox.enqueued", data: { sessionID: "s1", inboxID: "msg1", item: { type: "system", payload: { text: "x" } } } }),
    [],
  );
});

test("session.inbox.enqueued with empty text is dropped", () => {
  assert.deepEqual(
    translateV2Event({ type: "session.inbox.enqueued", data: { sessionID: "s1", item: { type: "user", payload: { text: "" } } } }),
    [],
  );
});

test("session.step.started also emits session.updated for the Mission Log", () => {
  const out = translateV2Event(
    {
      type: "session.step.started",
      location: { directory: "C:\\repo\\app" },
      data: { sessionID: "s1", agent: "quetzal", model: { id: "m1", providerID: "p" } },
    },
    new Map(),
  );
  const su = out.find((e) => e.type === "session.updated");
  assert.ok(su);
  assert.equal(su.properties.info.id, "s1");
  assert.equal(su.properties.info.directory, "C:/repo/app");
});

test("session.tool.input.started caches the tool name for session.tool.called", () => {
  const meta = new Map();
  translateV2Event(
    { type: "session.tool.input.started", data: { sessionID: "s1", id: "call_1", name: "bash" } },
    meta,
  );
  const out = translateV2Event(
    { type: "session.tool.called", data: { sessionID: "s1", id: "call_1", input: {} } },
    meta,
  );
  assert.equal(out[0].properties.tool.name, "bash");
});

test("session.tool.input.started surfaces the live tool in the Quest Log", () => {
  const meta = new Map();
  const out = translateV2Event(
    { type: "session.tool.input.started", data: { sessionID: "s1", id: "c1", name: "bash" } },
    meta,
  );
  const tu = out.find((e) => e.type === "todo.updated");
  assert.ok(tu);
  assert.deepEqual(tu.properties.todos, [{ id: "c1", content: "bash", status: "in_progress", priority: "" }]);
});

test("session.tool.success removes the tool from the Quest Log", () => {
  const meta = new Map();
  translateV2Event({ type: "session.tool.input.started", data: { sessionID: "s1", id: "c1", name: "bash" } }, meta);
  const out = translateV2Event({ type: "session.tool.success", data: { sessionID: "s1", id: "c1", content: [] } }, meta);
  const tu = out.find((e) => e.type === "todo.updated");
  assert.ok(tu);
  assert.deepEqual(tu.properties.todos, []);
});
