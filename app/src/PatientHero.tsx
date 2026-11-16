import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Patient } from "./model";
import { PatientPhoto } from "./PatientPhoto";
import { severityLabel } from "./patientPresentation";

type Pane = "info" | "owner" | "belongings";
const icons = {
  info: <><circle cx="10" cy="10" r="8"/><path d="M10 9v6M10 5v1"/></>,
  owner: <><circle cx="10" cy="6" r="3"/><path d="M3 18v-2a7 7 0 0 1 14 0v2"/></>,
  belongings: <><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M7 6V3h6v3"/></>,
  refresh: <><path d="M17 8a7 7 0 1 0 0 5M17 3v5h-5"/></>,
};
function Icon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">{icons[name]}</svg>;
}
export function PatientHero({ patient, demo, onBack, onPhotoEdit, onRefresh, refreshing, showActions, children, belongings }: {
  patient: Patient; demo: boolean; onBack: () => void; onPhotoEdit?: () => void;
  onRefresh: () => void; refreshing: boolean; showActions: boolean; children: ReactNode; belongings: ReactNode;
}) {
  const [pane, setPane] = useState<Pane | null>(null);
  useEffect(() => { if (showActions) setPane("info"); }, [patient.id, showActions]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el || !pane) return;
    const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    if (pane === "belongings") {
      const details = el.querySelector<HTMLDetailsElement>(".belongings");
      if (details) details.open = true;
    }
    return () => { el.close(); previous?.focus(); };
  }, [pane]);
  const titles = { info: "Сведения", owner: "Владелец", belongings: "Вещи" };
  return <section className="patient-hero-section" aria-label="Карточка открытого пациента">
    <div className="patient-hero-service">
      <button type="button" onClick={onBack}>‹ Пациенты</button>
      <button type="button" aria-label="Дополнительные действия с пациентом" onClick={() => setPane("info")}>⋯</button>
    </div>
    <div className="patient-hero-photo">
      <PatientPhoto patient={patient} demo={demo} large animalFallback onEdit={onPhotoEdit}/>
      <div className="patient-hero-gradient"/>
      <div className="patient-hero-caption">
        <h1 title={patient.name}>{patient.name}</h1>
        <p>{[patient.species, patient.weight ? `${patient.weight} кг` : "", patient.cage].filter(Boolean).join(" · ")}</p>
        <span className="patient-hero-severity">{severityLabel(patient.severity) || "Тяжесть не указана"}</span>
      </div>
    </div>
    <div className="patient-hero-diagnosis">
      <span aria-hidden="true">✚</span>
      <p title={patient.diagnoses || "Диагноз не указан"}>{patient.diagnoses || "Диагноз не указан"}</p>
    </div>
    <div className="patient-hero-actions">
      {([['info','Сведения'],['owner','Владелец'],['belongings','Вещи']] as const).map(([key,label]) => <button type="button" key={key} aria-haspopup="dialog" aria-pressed={pane === key} onClick={() => setPane(key)}><Icon name={key}/><span>{label}</span></button>)}
      <button type="button" disabled={refreshing} aria-busy={refreshing} onClick={onRefresh}><Icon name="refresh"/><span>Обновить</span></button>
    </div>
    {pane && <dialog ref={dialog} className="bottom-sheet test3-dialog patient-hero-dialog" aria-label={pane ? titles[pane] : "Сведения пациента"} onCancel={e => { e.preventDefault(); setPane(null); }}>
      <div className="sheet-header"><h2>{pane ? titles[pane] : "Сведения"} · {patient.name}</h2><button type="button" className="icon-button" aria-label="Закрыть сведения пациента" onClick={() => setPane(null)}>×</button></div>
      <div hidden={pane !== "info"} className="test3-patient-info">
        <p>{[patient.species,patient.breed,patient.weight ? `${patient.weight} кг` : "",patient.cage ? `Клетка ${patient.cage}` : ""].filter(Boolean).join(" · ")}</p>
        <p>{patient.diagnoses || "Диагноз не указан"}</p><div onClick={e => { if ((e.target as HTMLElement).closest(".patient-actions button")) setPane(null); }}>{children}</div>
      </div>
      <div hidden={pane !== "owner"}><p className={patient.ownerName ? "patient-owner" : undefined}>Владелец: {patient.ownerName || "Данные не указаны"}</p></div>
      <div hidden={pane !== "belongings"}>{belongings || <p>Вещи недоступны в этом источнике данных.</p>}</div>
      <button type="button" className="secondary full" onClick={() => setPane(null)}>Закрыть</button>
    </dialog>}
  </section>;
}
