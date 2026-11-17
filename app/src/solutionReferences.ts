/** Public original SA.states, read-only reference; never populates a patient's rate. */
export const CONTINUING_LOSSES_REFERENCE = [
  { name: "Повышение температуры на 1℃", value: "0.4" },
  { name: "Тахипное +10 ДД", value: "0.3" },
  { name: "Парез кишечника, пиометра", value: "1-2" },
  { name: "Диарея", value: "1-2" },
  { name: "Рвота", value: "1" },
] as const;
