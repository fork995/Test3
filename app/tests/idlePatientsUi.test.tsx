// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkBoard } from "../src/WorkBoard";
import { normalizePatients, normalizeChains, indexChains } from "../src/model";
import { sheetPeriods } from "../src/period";
import type { CardData } from "../src/store";
import { rawPatients, T } from "./fixtures";
import { workChains } from "./workFixtures";

it("groups only confirmed idle patients, starts collapsed and retains navigation and expansion on refresh", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const patients = normalizePatients(rawPatients(4));
  const ready = (chains = normalizeChains([])): CardData => ({
    phase: "ready", hasData: true, chains, indexes: indexChains(chains),
    receivedAt: null, error: "", diagnostic: false,
  });
  const snapshot = new Map([
    [patients[0].cardId, ready()], [patients[1].cardId, ready()],
    [patients[2].cardId, ready(normalizeChains(workChains()))],
    [patients[3].cardId, { ...ready(), hasData: false, phase: "loading" as const }],
  ]);
  const onPatient = vi.fn();
  function Board() {
    const [expanded, setExpanded] = useState(new Set<string>());
    return <WorkBoard compact patients={patients} snapshot={new Map(snapshot)}
      period={sheetPeriods(patients)[1]} zone="UTC" now={Date.parse(T(18, 8, 42))}
      category="ALL" demo={false} history={false} expanded={expanded}
      setExpanded={setExpanded} onSelect={() => {}} onOpenPatient={onPatient} onRetry={() => {}} />;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Board />));
    const section = container.querySelector<HTMLDetailsElement>(".idle-patients")!;
    expect(section.open).toBe(false);
    expect(section.querySelector("summary")?.textContent).toBe("Без открытых подтверждённых заданий · 2");
    expect(section.querySelectorAll(".work-idle-patient")).toHaveLength(2);
    await act(async () => { section.open = true; section.dispatchEvent(new Event("toggle", { bubbles: true })); });
    await act(async () => root.render(<Board />));
    expect(section.open).toBe(true);
    await act(async () => (section.querySelector("button") as HTMLButtonElement).click());
    expect(onPatient).toHaveBeenCalledWith(patients[0]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
