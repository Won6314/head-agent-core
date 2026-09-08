import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CompactRecovery, compactProjection, extractCompactedUserTurns, isHeadCoreSystemEntry, loadCompactedUserTurns, placeSessionContext, placeUserTurns, POINTER, sessionIsIdle, userTurnsSince,
} from "./compact-recovery.mjs";
import { chooseCompactPrompt, collectCompactedUserTurns, HEAD_CHARS, lastCheckpointIso, overrideCurrentOnly, overridePointerOnly, overrideSinceCheckpoint, USER_TURNS_MARKER, formatCompactedUserTurns } from "../shared/compact-policy.mjs";

const TMP = "/tmp/opencode";
fs.mkdirSync(TMP, { recursive: true });

function after(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("checkpoint-gap branching selects pointer-only, since-checkpoint, and current-only", () => {
  const root = fs.mkdtempSync(path.join(TMP, "compact-branch-"));
  const session = path.join(root, ".claude", "agents", "head", "sessions", "demo");
  fs.mkdirSync(session, { recursive: true });
  const checkpoint = "2026-09-01T00:00:00.000Z";
  fs.writeFileSync(path.join(session, "history.md"), `## ${checkpoint}\n\nrecorded\n`);
  const afterCheckpoint = Date.parse("2026-09-01T01:00:00.000Z");
  const beforeCheckpoint = Date.parse("2026-08-31T23:00:00.000Z");

  assert.equal(lastCheckpointIso(fs.readFileSync(path.join(session, "history.md"), "utf8")), checkpoint);
  assert.equal(chooseCompactPrompt({}).mode, "current-only");
  assert.equal(chooseCompactPrompt({ runtime: "opencode" }).mode, "current-only");
  assert.equal(chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: 0 }).mode, "pointer-only");

  const noneAfter = [{ info: { id: "u0", role: "user", time: { created: beforeCheckpoint } }, parts: [{ type: "text", text: "old" }] }];
  const pointer = chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: userTurnsSince(noneAfter, checkpoint) });
  assert.equal(pointer.mode, "pointer-only");
  assert.equal(pointer.text, overridePointerOnly());
  assert.match(pointer.text, /이전 대화는 요약하지 않는다/);
  assert.match(pointer.text, /Do not write next steps, pending tasks, recommendations/);
  assert.doesNotMatch(pointer.text, /이어가기 지시문/);

  const later = [
    { info: { id: "u1", role: "user", time: { created: afterCheckpoint } }, parts: [{ type: "text", text: "do the compact parity" }] },
    { info: { id: "a1", role: "assistant" }, parts: [{ type: "tool", tool: "question", state: { status: "completed", output: "User has answered your questions: \"keep?\"=\"yes\"." } }] },
  ];
  later[1].info.time = { created: afterCheckpoint + 1000 };
  assert.equal(userTurnsSince(later, checkpoint), 2);
  const since = chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: userTurnsSince(later, checkpoint) });
  assert.equal(since.mode, "since-checkpoint");
  assert.equal(since.turns, 2);
  assert.equal(since.text, overrideSinceCheckpoint(checkpoint, 2));
  assert.match(since.text, /마지막 체크포인트\(2026-09-01T00:00:00.000Z\) 이후 진행분/);
  assert.match(since.text, /at most 8 short lines/);
  assert.match(since.text, /Do not write next steps, pending tasks, recommendations/);
  assert.doesNotMatch(since.text, /이어가기 지시문/);

  fs.rmSync(path.join(session, "history.md"));
  const fallback = chooseCompactPrompt({ userTurnsSinceCheckpoint: userTurnsSince(later, checkpoint) });
  assert.equal(fallback.mode, "current-only");
  assert.equal(fallback.text, overrideCurrentOnly());
  fs.rmSync(root, { recursive: true, force: true });
});

test("places session context after current Core heading and Instructions-from wrapper", () => {
  const wrappedCore = "Instructions from: /core/head/HEAD_CORE.md\n\n# HEAD Core\nbody";
  const legacy = "Instructions from: /core/head/HEAD_CORE.md\n\n# HEAD Principles\n";
  const project = "Instructions from: CLAUDE.md\n\nproject";
  assert.equal(isHeadCoreSystemEntry(wrappedCore), true);
  assert.equal(isHeadCoreSystemEntry(legacy), true);
  assert.equal(isHeadCoreSystemEntry(project), false);

  const first = placeSessionContext([wrappedCore, project], "<HEAD_RUNTIME_CONTEXT>\none\n</HEAD_RUNTIME_CONTEXT>");
  assert.deepEqual(first.map((entry) => entry.includes("HEAD_RUNTIME_CONTEXT") ? "session" : entry === wrappedCore ? "core" : "project"), ["core", "session", "project"]);
  const second = placeSessionContext(first, "<HEAD_RUNTIME_CONTEXT>\ntwo\n</HEAD_RUNTIME_CONTEXT>");
  assert.equal(second.filter((entry) => entry.includes("HEAD_RUNTIME_CONTEXT")).length, 1);
  assert.match(second[1], /two/);

  const standalone = placeSessionContext(["# HEAD Core\n", project], "<HEAD_RUNTIME_CONTEXT>\nstandalone\n</HEAD_RUNTIME_CONTEXT>");
  assert.equal(standalone[0], "# HEAD Core\n");
  assert.match(standalone[1], /standalone/);
});

test("restores verbatim user text and question answers from the compacted span only", () => {
  const t1 = Date.parse("2026-09-01T10:00:00.000Z");
  const t2 = Date.parse("2026-09-01T10:05:00.000Z");
  const t3 = Date.parse("2026-09-01T11:00:00.000Z");
  const t4 = Date.parse("2026-09-01T11:10:00.000Z");
  const messages = [
    { info: { id: "old", role: "user", time: { created: t1 } }, parts: [{ type: "text", text: "first span instruction" }] },
    { info: { id: "cmp1", role: "user" }, parts: [{ type: "compaction", auto: false }] },
    { info: { id: "sum1", role: "assistant", mode: "compaction", summary: true }, parts: [{ type: "text", text: "prior summary must not return" }] },
    { info: { id: "u2", role: "user", time: { created: t2 } }, parts: [{ type: "text", text: "keep this exact user line" }] },
    { info: { id: "slash", role: "user", time: { created: t2 + 1 } }, parts: [{ type: "text", text: "/compact" }] },
    { info: { id: "syn", role: "user", time: { created: t2 + 2 } }, parts: [{ type: "text", text: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.", synthetic: true, metadata: { compaction_continue: true } }] },
    { info: { id: "tool", role: "assistant", time: { created: t2 + 3 } }, parts: [{ type: "tool", tool: "bash", state: { status: "completed", output: "worker stdout" } }] },
    { info: { id: "q", role: "assistant", time: { created: t3 } }, parts: [{ type: "tool", tool: "question", state: { status: "completed", output: "User has answered your questions: \"path?\"=\"/tmp/opencode\"." } }] },
    { info: { id: "u3", role: "user", time: { created: t4 } }, parts: [{ type: "text", text: "last instruction before compact" }] },
    { info: { id: "cmp2", role: "user" }, parts: [{ type: "compaction", auto: true }] },
  ];
  const turns = extractCompactedUserTurns(messages);
  assert.deepEqual(turns.map((turn) => turn.body), [
    "keep this exact user line",
    "(질문 답변) User has answered your questions: \"path?\"=\"/tmp/opencode\".",
    "last instruction before compact",
  ]);
  const formatted = formatCompactedUserTurns(turns);
  assert.match(formatted, /keep this exact user line/);
  assert.match(formatted, /질문 답변[\s\S]*\/tmp\/opencode/);
  assert.match(formatted, /last instruction before compact/);
  assert.doesNotMatch(formatted, /first span instruction|prior summary|worker stdout|\/compact|Continue if you have next steps/);
  assert.match(formatted, /09-01 11:10/);
});

test("clear starts a new compacted span and older long turns shorten under the 20k budget", () => {
  const messages = [
    { info: { id: "a", role: "user", time: { created: 1 } }, parts: [{ type: "text", text: "before clear" }] },
    { info: { id: "c", role: "user", time: { created: 2 } }, parts: [{ type: "text", text: "/clear" }] },
    { info: { id: "b", role: "user", time: { created: 3 } }, parts: [{ type: "text", text: "after clear" }] },
  ];
  assert.deepEqual(extractCompactedUserTurns(messages).map((turn) => turn.body), ["after clear"]);

  const long = "x".repeat(8_000);
  const turns = Array.from({ length: 8 }, (_, index) => ({ ts: "01-01 00:00", body: index < 3 ? long : "short" }));
  const fitted = collectCompactedUserTurns(turns);
  assert.match(fitted[0].body, /…\(생략\)$/);
  assert.equal(fitted[0].body.length, HEAD_CHARS + " …(생략)".length);
  assert.equal(fitted[fitted.length - 1].body, "short");
  assert.equal(fitted[fitted.length - 1].body.includes("생략"), false);
});

test("treats an absent session status and explicit idle as idle", () => {
  assert.equal(sessionIsIdle({}, "ses_demo"), true);
  assert.equal(sessionIsIdle({ ses_demo: { type: "idle" } }, "ses_demo"), true);
  assert.equal(sessionIsIdle({ ses_demo: { type: "busy" } }, "ses_demo"), false);
  assert.equal(sessionIsIdle({ ses_demo: { type: "retry", attempt: 1 } }, "ses_demo"), false);
  assert.equal(sessionIsIdle(null, "ses_demo"), false);
});

test("compact projection keeps the factual summary and drops only compaction request markers", () => {
  const messages = [
    { info: { id: "u", role: "user" }, parts: [{ type: "text", text: "hello" }] },
    { info: { id: "cmp", role: "user" }, parts: [{ type: "compaction" }] },
    { info: { id: "sum", role: "assistant", summary: true, mode: "compaction" }, parts: [{ type: "text", text: "facts only" }] },
    { info: { id: "cont", role: "user" }, parts: [{ type: "text", text: "Continue if you have next steps", synthetic: true, metadata: { compaction_continue: true } }] },
  ];
  const projected = compactProjection(messages);
  assert.equal(projected.some((message) => message.info.id === "cmp"), false);
  assert.equal(projected.some((message) => message.info.id === "sum"), true);
  assert.equal(projected.some((message) => message.info.id === "cont"), true);
});

function lifecycleFixture(t, name = "demo") {
  const root = fs.mkdtempSync(path.join(TMP, "compact-recovery-lifecycle-"));
  const session = path.join(root, ".claude", "agents", "head", "sessions", name);
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "fixture");
  fs.writeFileSync(path.join(root, ".claude", "agents", "head", "CLAUDE.md"), "fixture");
  fs.writeFileSync(path.join(session, "context.md"), "demo session context");
  fs.writeFileSync(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  fs.writeFileSync(path.join(session, "history.md"), "## 2026-09-01T00:00:00.000Z\n\ncheckpoint\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const afterCheckpoint = Date.parse("2026-09-01T02:00:00.000Z");
  const messages = [{ info: { id: "user_1", role: "user", model: { providerID: "p", modelID: "m" }, time: { created: afterCheckpoint } }, parts: [{ type: "text", text: "exact user instruction" }] }];
  const submissions = [];
  let summarized = 0;
  const statuses = {};
  const client = { session: {
    messages: async () => ({ data: messages }),
    summarize: async () => {
      summarized += 1;
      messages.push({ info: { id: "cmp_tool", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum_tool", role: "assistant", parentID: "cmp_tool", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum_tool", text: "generated next instruction must not replay" }] });
      return { data: true };
    },
    status: async () => ({ data: statuses }),
    promptAsync: async ({ body }) => { submissions.push(body.parts[0].text); return { data: true }; },
  } };
  const options = { client, root, schema: {}, detectLocation: () => ({ sessionName: name, tabLabel: name }) };
  return { root, messages, submissions, statuses, options, summarized: () => summarized };
}

test("tool compact summarizes at idle and never promptAsync-replays generated instructions", async (t) => {
  const fixture = lifecycleFixture(t);
  const plugin = await CompactRecovery(fixture.options);
  const id = "ses_tool";
  fixture.statuses[id] = { type: "busy" };
  await plugin.tool.checkpoint_compact.execute({}, { sessionID: id });
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.equal(fixture.summarized(), 1);
  assert.deepEqual(fixture.submissions, []);
  const compacting = { prompt: "", context: ["unowned"] };
  await plugin["experimental.session.compacting"]({ sessionID: id }, compacting);
  assert.match(compacting.prompt, /마지막 체크포인트\(2026-09-01T00:00:00.000Z\) 이후 진행분/);
  assert.deepEqual(compacting.context, []);
  const autocontinue = { enabled: true };
  await plugin["experimental.compaction.autocontinue"]({ sessionID: id }, autocontinue);
  assert.equal(autocontinue.enabled, true);
  await plugin.event({ event: { type: "session.compacted", properties: { sessionID: id } } });
  await after(15);
  assert.deepEqual(fixture.submissions, []);
  const span = loadCompactedUserTurns(fixture.root, id);
  assert.match(span.text, /exact user instruction/);
});

test("native compact keeps autocontinue enabled and does not replay the summary as a user command", async (t) => {
  const fixture = lifecycleFixture(t);
  const id = "ses_native";
  fixture.messages.push({ info: { id: "cmp_native", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum_native", role: "assistant", parentID: "cmp_native", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum_native", text: "NATIVE CONTINUATION" }] });
  const plugin = await CompactRecovery(fixture.options);
  const compacting = { prompt: "", context: ["unowned"] };
  const autocontinue = { enabled: true };
  await plugin["experimental.session.compacting"]({ sessionID: id }, compacting);
  await plugin["experimental.compaction.autocontinue"]({ sessionID: id }, autocontinue);
  assert.match(compacting.prompt, new RegExp(POINTER));
  assert.equal(autocontinue.enabled, true);
  await plugin.event({ event: { type: "session.compacted", properties: { sessionID: id } } });
  assert.deepEqual(fixture.submissions, []);
  assert.equal(fixture.summarized(), 0);
});

test("session canon and compacted user turns land after Core on the next request, including restart", async (t) => {
  const fixture = lifecycleFixture(t);
  const plugin = await CompactRecovery(fixture.options);
  const id = "ses_sticky";
  await plugin["experimental.session.compacting"]({ sessionID: id }, { prompt: "", context: [] });
  await plugin["experimental.compaction.autocontinue"]({ sessionID: id }, { enabled: true });
  const core = "Instructions from: /core/head/HEAD_CORE.md\n\n# HEAD Core\n";
  const first = { system: [core, "project"] };
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, first);
  assert.equal(first.system[0], core);
  assert.match(first.system[1], /HEAD_RUNTIME_CONTEXT/);
  assert.match(first.system[1], /demo session context/);
  assert.match(first.system[2], new RegExp(USER_TURNS_MARKER));
  assert.match(first.system[2], /exact user instruction/);
  assert.equal(first.system.some((entry) => String(entry).includes("HEAD_ATTENTION_CHECKPOINT")), false);

  const restarted = await CompactRecovery(fixture.options);
  const second = { system: [core, "project"] };
  await restarted["experimental.chat.system.transform"]({ sessionID: id }, second);
  assert.match(second.system[1], /HEAD_RUNTIME_CONTEXT/);
  assert.match(second.system[2], /exact user instruction/);
  assert.deepEqual(fixture.submissions, []);
});

test("unresolved or non-HEAD sessions leave native compact flow untouched", async (t) => {
  const fixture = lifecycleFixture(t);
  const plugin = await CompactRecovery({ ...fixture.options, detectLocation: () => ({ sessionName: "missing", tabLabel: "missing" }) });
  const id = "ses_other";
  assert.equal(await plugin.tool.checkpoint_compact.execute({}, { sessionID: id }), "No validated Herdr tab/session is available for compaction.");
  assert.equal(plugin["experimental.chat.messages.transform"], undefined);
  const compacting = { prompt: "native-default", context: ["keep"] };
  await plugin["experimental.session.compacting"]({ sessionID: id }, compacting);
  assert.equal(compacting.prompt, "native-default");
  assert.deepEqual(compacting.context, ["keep"]);
  const autocontinue = { enabled: true };
  await plugin["experimental.compaction.autocontinue"]({ sessionID: id }, autocontinue);
  assert.equal(autocontinue.enabled, true);
  const system = { system: ["# HEAD Core\n", "project"] };
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, system);
  assert.deepEqual(system.system, ["# HEAD Core\n", "project"]);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.equal(fixture.summarized(), 0);
  assert.deepEqual(fixture.submissions, []);
});

test("failed compact does not replace a previously successful span on disk", async (t) => {
  const fixture = lifecycleFixture(t);
  const plugin = await CompactRecovery(fixture.options);
  const id = "ses_failspan";
  await plugin["experimental.session.compacting"]({ sessionID: id }, { prompt: "", context: [] });
  assert.equal(loadCompactedUserTurns(fixture.root, id), null);
  await plugin.event({ event: { type: "session.compacted", properties: { sessionID: id } } });
  assert.match(loadCompactedUserTurns(fixture.root, id).text, /exact user instruction/);
  fixture.messages.push({ info: { id: "later", role: "user", time: { created: Date.parse("2026-09-01T04:00:00.000Z") } }, parts: [{ type: "text", text: "second span must not land on failed compact" }] });
  await plugin["experimental.session.compacting"]({ sessionID: id }, { prompt: "", context: [] });
  assert.match(loadCompactedUserTurns(fixture.root, id).text, /exact user instruction/);
  assert.doesNotMatch(loadCompactedUserTurns(fixture.root, id).text, /second span must not land/);
});

test("placeUserTurns replaces a prior copy and sits after session canon", () => {
  const core = "# HEAD Core\n";
  const system = [core];
  placeSessionContext(system, "<HEAD_RUNTIME_CONTEXT>\ncanon\n</HEAD_RUNTIME_CONTEXT>");
  placeUserTurns(system, `${USER_TURNS_MARKER}\none`);
  placeUserTurns(system, `${USER_TURNS_MARKER}\ntwo`);
  assert.equal(system.filter((entry) => String(entry).includes(USER_TURNS_MARKER)).length, 1);
  assert.match(system[2], /two/);
  placeUserTurns(system, "");
  assert.equal(system.some((entry) => String(entry).includes(USER_TURNS_MARKER)), false);
});
