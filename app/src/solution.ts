import { obj, type Obj } from "./model";
// Original Ab/hS/mS/pS/Tb/Mb. Restrict the ambiguous >20kg maintenance branch.
export function solutionRate(s: Obj): number | null {
  const w = s.weightKg;
  if (
    typeof w !== "number" ||
    !Number.isFinite(w) ||
    w <= 0 ||
    typeof s.maintenance !== "boolean"
  )
    return null;
  let rate = 0,
    components = 0;
  if (s.scarce != null) {
    const q = obj(s.scarce);
    if ("value" in q) {
      if (Object.keys(q).some((k) => k !== "value") || !positive(q.value))
        return null;
      rate += q.value;
      components++;
    } else {
      const i = obj(q.initial);
      if (
        !positive(q.dehydration) ||
        q.dehydration > 100 ||
        !positive(i.volumePercentage) ||
        i.volumePercentage > 100 ||
        !positive(i.durationHours)
      )
        return null;
      rate +=
        (q.dehydration * w * 8 * i.volumePercentage) / 100 / i.durationHours;
      components++;
    }
  }
  if (s.maintenance) {
    if (w > 20) return null;
    rate += (w * 30 + 70) / 24;
    components++;
  }
  if (s.continuingLosses != null) {
    const q = obj(s.continuingLosses);
    if (!positive(q.ratePerWeight)) return null;
    rate += q.ratePerWeight * w;
    components++;
  }
  return components && Number.isFinite(rate) && rate > 0 ? rate : null;
}
function positive(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
