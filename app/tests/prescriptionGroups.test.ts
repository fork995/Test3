import { expect, it } from "vitest";
import { CATEGORIES, normalizeChains } from "../src/model";
import { createSessionApi } from "../src/session";
import {
  draftProblem,
  makePrescription,
  type PrescriptionDraft,
} from "../src/prescriptions";
import { prescriptionServer, pSpecifics } from "./prescriptionFixtures";
import { nameHints, CONCENTRATION_HINTS } from "../src/prescriptionNames";
import { solutionRate } from "../src/solution";
import { clinicalParameters } from "../src/clinical";
const draft = (type: PrescriptionDraft["type"]): PrescriptionDraft => ({
  type,
  name: "ДЕМО — тест",
  start: "2026-10-19T13:00:00Z",
  periodicity: 1,
  color: "orange",
  instruction: "Тест",
  zone: "Europe/Moscow",
  ...(type === "MEDICATION"
    ? { specifics: pSpecifics() }
    : type === "SOLUTION"
      ? { specifics: { scarce: { value: 5 }, maintenance: false, weightKg: 4 } }
      : {}),
});
for (const type of CATEGORIES)
  it(`creates ${type} in initially empty category and returns fresh server state`, async () => {
    const server = prescriptionServer(),
      source = createSessionApi("SYNTHETIC_NOT_A_JWT", server.fetcher);
    const patient = (await source.patients("b", "d"))[0];
    source.prescriptions!.setEnabled(true);
    const r = await source.prescriptions!.create(patient, draft(type));
    const post = server.calls.find((c) => c.method === "POST")!;
    expect(post.body.type).toBe(type);
    expect(post.body.prescription.dates).toEqual({
      start: "2026-10-19T13:00:00.000Z",
      periodicity: 1,
    });
    expect(post.body.prescription.color).toBe("orange");
    expect(post.body.prescription.results).toEqual([]);
    expect(r.chains.find((c) => c.id === post.body.id)?.type).toBe(type);
    expect(server.calls.at(-1)?.method).toBe("GET");
    source.close();
  });
it("category dictionaries use original substring search and never cross categories", () => {
  expect(nameHints("NURSING", "кОрМ")).toEqual(["Кормление"]);
  expect(nameHints("PROCEDURE", "корм")).toEqual([]);
  expect(nameHints("MEDICATION", "лидокаин")).toContain("Лидокаин");
  expect(CONCENTRATION_HINTS["Лидокаин"].map((q) => q.value)).toEqual([
    20, 100,
  ]);
  for (const t of CATEGORIES)
    expect(nameHints(t, "").length).toBeGreaterThan(0);
});
it("ACTIVITY planned is periodicity presence; no invented specifics", () => {
  for (const p of [null, 0, 1, 24]) {
    const payload = makePrescription({ ...draft("ACTIVITY"), periodicity: p });
    expect(Object.hasOwn(payload.dates, "periodicity")).toBe(p !== null);
    expect(payload.specifics).toBeUndefined();
  }
  for (const p of [-1, 0.5, 25, NaN])
    expect(
      draftProblem({ ...draft("MONITORING"), periodicity: p }),
    ).toBeTruthy();
});
it("solution components use original contract and block ambiguous maintenance branch", () => {
  expect(
    solutionRate({
      weightKg: 4,
      maintenance: false,
      scarce: { value: 10 },
      continuingLosses: { ratePerWeight: 2 },
    }),
  ).toBe(18);
  expect(solutionRate({ weightKg: 4, maintenance: true })).toBeCloseTo(
    190 / 24,
  );
  expect(
    solutionRate({
      weightKg: 4,
      maintenance: false,
      scarce: {
        dehydration: 5,
        initial: { volumePercentage: 50, durationHours: 8 },
      },
    }),
  ).toBe(10);
  expect(solutionRate({ weightKg: 21, maintenance: true })).toBeNull();
  for (const value of [0, -1, NaN, Infinity])
    expect(
      solutionRate({ weightKg: 4, maintenance: false, scarce: { value } }),
    ).toBeNull();
});
it("medication prevents unsupported calculations and accepts distinct display modes", () => {
  for (const viewMode of ["DOSAGE", "TOTAL_SUBSTANCE", "TOTAL_VOLUME"]) {
    const d = draft("MEDICATION");
    d.specifics!.viewMode = viewMode;
    expect(draftProblem(d)).toBeNull();
    expect(makePrescription(d).specifics!.viewMode).toBe(viewMode);
  }
  const d = draft("MEDICATION");
  d.specifics!.dosage = {
    value: 1,
    units: { substance: "MILLIMOLE", volume: "KILOGRAM" },
  };
  expect(draftProblem(d)).toBeTruthy();
  d.specifics = pSpecifics();
  d.specifics.dosage = {
    value: 1,
    units: { substance: "MILLIGRAM", volume: "KILOGRAM", time: "MINUTE" },
  };
  expect(draftProblem(d)).toBeNull();
  d.periodicity = 8;
  expect(draftProblem(d)).toBeTruthy();
  d.periodicity = 1;
  d.specifics.route = "ORAL";
  expect(draftProblem(d)).toBeTruthy();
});
it("dilution keeps input separate; invalid quantities cannot be posted", () => {
  const d = draft("MEDICATION");
  d.specifics!.supplementarySolvent = { volume: 5 };
  expect(draftProblem(d)).toBeNull();
  const p = makePrescription(d);
  expect(p.specifics!.dosage).toEqual(pSpecifics().dosage);
  for (const volume of [-1, NaN, Infinity, "5"]) {
    d.specifics!.supplementarySolvent = { volume };
    expect(draftProblem(d)).toBeTruthy();
  }
});
it("solution grid summary shows sum rather than scarce alone", () => {
  const d = draft("SOLUTION");
  d.specifics!.continuingLosses = { ratePerWeight: 2 };
  const p = makePrescription(d);
  const c = normalizeChains([
    { id: "demo", type: "SOLUTION", name: d.name, elements: [p] },
  ])[0];
  expect(clinicalParameters(c, c.elements[0])).toBe("13 мл/ч");
});
it("volume substance requires matching concentration and divides by its numeric value", () => {
  const d = draft("MEDICATION");
  d.specifics!.dosage = {
    value: 2,
    units: { substance: "MILLILITRE", volume: "KILOGRAM" },
  };
  expect(draftProblem(d)).toBeTruthy();
  d.specifics!.concentration = {
    value: 2,
    units: { substance: "MILLILITRE", volume: "MILLILITRE" },
  };
  expect(draftProblem(d)).toBeNull();
  const c = normalizeChains([
    {
      id: "demo",
      type: "MEDICATION",
      name: "ДЕМО",
      elements: [
        makePrescription({
          ...d,
          specifics: { ...d.specifics, viewMode: "TOTAL_VOLUME" },
        }),
      ],
    },
  ])[0];
  expect(clinicalParameters(c, c.elements[0])).toContain("4 мл");
});
