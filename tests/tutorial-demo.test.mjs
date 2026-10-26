import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCSV } from "../talestolen-src/src/utils/delegatesCsv.js";

test("demo-CSV contains ten importable delegates", () => {
  const csv = readFileSync(new URL("../talestolen-src/public/demo-delegater.csv", import.meta.url), "utf8");
  const rows = parseCSV(csv);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[1], { number: "2", name: "Birk Eksempel", org: "Skien vgs" });
});

test("tutorial actions use the real bus without persisting or broadcasting", async () => {
  const storage = new Map();
  const broadcasts = [];
  globalThis.window = {
    location: { search: "?id=tutorial-test" },
    addEventListener() {},
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.BroadcastChannel = class {
    postMessage(message) { broadcasts.push(message); }
  };

  const bus = await import("../talestolen-src/src/store/bus.js");
  bus.loadDelegates([{ number: "99", name: "Virkelig delegat", org: "Rådet" }]);
  const savedSnapshot = storage.get("talestolen_state_v2_tutorial-test");
  const publishedCount = broadcasts.length;

  bus.enterTutorialMode();
  bus.loadDelegates([{ number: "1", name: "Ada Eksempel", org: "Skien ungdomsråd" }]);
  bus.addToQueueByDelegate({ delegateNumber: "1", type: "innlegg" });
  bus.startNext();
  assert.equal(bus.getState().currentSpeaker.name, "Ada Eksempel");
  assert.equal(storage.get("talestolen_state_v2_tutorial-test"), savedSnapshot);
  assert.equal(broadcasts.length, publishedCount);

  bus.exitTutorialMode();
  assert.deepEqual(Object.keys(bus.getState().delegates), ["99"]);
  assert.equal(bus.getState().currentSpeaker, null);
});
