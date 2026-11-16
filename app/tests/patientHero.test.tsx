// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { PatientHero } from "../src/PatientHero";
import { normalizePatients } from "../src/model";
it("keeps four actions and opens the matching content without losing the full diagnosis", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const patient = normalizePatients([{id:"p",name:"Учебный пациент",species:"Кошка",severity:"MODERATE",owner:{name:"Учебный владелец"},card:{id:"c",status:"ACTIVE",diagnoses:[{name:"Длинный учебный диагноз с полным текстом для просмотра"}]}}])[0];
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); const refresh = vi.fn();
  try {
    await act(async () => root.render(<PatientHero patient={patient} demo={false} onBack={() => {}} onRefresh={refresh} refreshing={false} showActions={false} belongings={<details className="belongings"><summary>Личные вещи</summary>Учебная вещь</details>}><button>Действие пациента</button></PatientHero>));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".patient-hero-actions button")];
    expect(buttons.map(b=>b.textContent)).toEqual(["Сведения","Владелец","Вещи","Обновить"]);
    expect(container.querySelector(".patient-hero-photo img")).toBeNull();
    for (const [i, text] of [[0,"Длинный учебный диагноз"],[1,"Учебный владелец"],[2,"Учебная вещь"]] as const) {
      await act(async () => buttons[i].click());
      expect(container.querySelector("dialog[open]")?.textContent).toContain(text);
      if (i===2) expect(container.querySelector<HTMLDetailsElement>(".belongings")?.open).toBe(true);
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Закрыть сведения пациента"]')!.click());
      expect(container.querySelector("dialog")).toBeNull();
    }
    await act(async () => buttons[3].click()); expect(refresh).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
afterEach(()=>vi.restoreAllMocks());
