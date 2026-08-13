import test from "node:test";
import assert from "node:assert/strict";
import { drainProjectSaveQueue } from "../src/projectSaveQueue.js";
import { projectRevision } from "../src/ai/projectRevision.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("save A in flight cannot discard pending B and flush persists B", async () => {
  const pending = new Map(), inFlight = new Map(), firstSave = deferred(), persisted = [];
  const projectA = { id: "project", name: "A", stages: [] };
  const projectB = { id: "project", name: "B", stages: [] };
  const persist = async (snapshot) => {
    persisted.push(snapshot.name);
    if (snapshot === projectA) await firstSave.promise;
  };

  pending.set(projectA.id, projectA);
  const savingA = drainProjectSaveQueue({ project: projectA, pending, inFlight, persist });
  pending.set(projectB.id, projectB);
  const flush = drainProjectSaveQueue({ project: pending.get(projectB.id), pending, inFlight, persist });
  assert.equal(flush, savingA);
  firstSave.resolve();

  assert.equal(await flush, true);
  assert.deepEqual(persisted, ["A", "B"]);
  assert.equal(pending.has(projectA.id), false);
  assert.equal(inFlight.has(projectA.id), false);
});

test("AI Apply autosave followed by immediate AI flush exposes the applied server revision", async () => {
  const pending = new Map(), inFlight = new Map(), firstSave = deferred();
  const projectA = { id: "project", name: "Before AI", stages: [] };
  const projectB = { id: "project", name: "After AI", stages: [{ id: "stage", name: "AI Stage", tasks: [] }] };
  let serverProject = null;
  const persist = async (snapshot) => {
    if (snapshot === projectA) await firstSave.promise;
    serverProject = structuredClone(snapshot);
  };

  pending.set(projectA.id, projectA);
  drainProjectSaveQueue({ project: projectA, pending, inFlight, persist });
  pending.set(projectB.id, projectB); // AI Apply schedules an immediate autosave.
  const immediateNextAiFlush = drainProjectSaveQueue({ project: projectB, pending, inFlight, persist });
  firstSave.resolve();
  assert.equal(await immediateNextAiFlush, true);

  const clientBaseRevision = await projectRevision(projectB);
  const serverRevision = await projectRevision(serverProject);
  assert.equal(serverRevision, clientBaseRevision);
});
