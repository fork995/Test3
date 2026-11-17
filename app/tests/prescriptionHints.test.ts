import { expect, it } from "vitest";
import {
  nameHints,
  concentrationHints,
  CONCENTRATION_HINTS,
} from "../src/prescriptionNames";
import {
  dosageSubstances,
  SOLVENT_NAMES,
  ROUTES_BY_VOLUME,
  DOSAGE_SUBSTANCES,
} from "../src/prescriptionCatalog";
it("original exact drug association never pools partial, case or whitespace variants", () => {
  expect(concentrationHints("Лидокаин", "MILLIGRAM", "MILLILITRE", "")).toEqual(
    ["20", "100"],
  );
  for (const name of [
    "Лид",
    "лидокаин",
    " Лидокаин",
    "Лидокаин ",
    "Нет такого",
  ])
    expect(concentrationHints(name, "MILLIGRAM", "MILLILITRE", "")).toEqual([]);
  expect(nameHints("MEDICATION", "лидо")).toEqual(["Лидокаин"]);
  expect(nameHints("MEDICATION", " Лидокаин")).toEqual([]);
});
it("original number substring filter respects unit pair; no cross-form concentrations", () => {
  expect(
    concentrationHints("Лидокаин", "MILLIGRAM", "MILLILITRE", "10"),
  ).toEqual(["100"]);
  expect(concentrationHints("Лидокаин", "MILLIGRAM", "MILLILITRE", "")).toEqual(
    ["20", "100"],
  );
  expect(concentrationHints("Лидокаин", "MICROGRAM", "MILLILITRE", "")).toEqual(
    [],
  );
  expect(concentrationHints("Лидокаин", "MILLIGRAM", "TABLET", "")).toEqual([]);
  expect(concentrationHints("Марфлоксин", "MILLIGRAM", "TABLET", "")).toEqual([
    "5",
    "20",
    "80",
  ]);
  expect(
    concentrationHints("Марфлоксин", "MILLIGRAM", "MILLILITRE", ""),
  ).toEqual(["20", "100"]);
  expect(
    concentrationHints("Ципрофлоксацин", "MILLIGRAM", "MILLILITRE", ""),
  ).toEqual(["2", "10", "3"]);
  for (const [name, values] of Object.entries(CONCENTRATION_HINTS))
    for (const q of values)
      expect(
        concentrationHints(name, q.units.substance, q.units.volume, ""),
      ).toContain(String(q.value));
});
it("injectable dosage substance options follow original mass group or exact substance", () => {
  for (const route of ["INTRAVENOUS", "SUBCUTANEOUS", "INTRAMUSCULAR"]) {
    expect(Object.keys(dosageSubstances(route, "MILLIGRAM"))).toEqual([
      "MICROGRAM",
      "MILLIGRAM",
      "GRAMME",
    ]);
    expect(Object.keys(dosageSubstances(route, "INTERNATIONAL_UNIT"))).toEqual([
      "INTERNATIONAL_UNIT",
    ]);
  }
  expect(dosageSubstances("ORAL", "MILLIGRAM")).toEqual(DOSAGE_SUBSTANCES);
  expect(ROUTES_BY_VOLUME.TABLET).toEqual(["ORAL", "RECTAL"]);
  expect(ROUTES_BY_VOLUME.DOSE).toEqual(["INHALATIONAL", "SUBCUTANEOUS"]);
  expect(SOLVENT_NAMES).toEqual([
    "Вода",
    "Натрия хлорид - 0,9%",
    "Раствор Рингера",
    "Специальный",
  ]);
});
