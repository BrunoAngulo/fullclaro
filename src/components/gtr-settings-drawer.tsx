"use client";

import { useRef, useState } from "react";
import { Settings, X } from "lucide-react";
import { GtrImportPanel } from "@/components/gtr-import-panel";
import { AiccSessionPanel } from "@/components/aicc-session-panel";

export function GtrSettingsDrawer({ onImported }: { onImported: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function show() {
    dialog.current?.showModal();
    setOpen(true);
  }

  return <>
    <button type="button" className="r-settings-trigger" aria-label="Abrir configuración" title="Configuración" aria-haspopup="dialog" aria-expanded={open} aria-controls="gtr-settings" onClick={show}>
      <Settings size={19} aria-hidden="true" />
      <span>Configuración</span>
    </button>
    <dialog ref={dialog} id="gtr-settings" className="r-settings-drawer" aria-labelledby="gtr-settings-title" aria-describedby="gtr-settings-description" onClose={() => setOpen(false)} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
    }}>
      <div className="r-settings-head">
        <div><span className="r-eyebrow">CENTRO DE OPERACIONES</span><h2 id="gtr-settings-title">Configuración</h2></div>
        <button type="button" className="r-settings-close" aria-label="Cerrar configuración" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="r-settings-body">
        <p id="gtr-settings-description">Resultados calculados por procedimientos almacenados de GTR_FullClaro.</p>
        <GtrImportPanel onImported={onImported} />
        <AiccSessionPanel />
        <div className="r-settings-note"><strong>Planificación de breaks</strong><p>Part time y turno madrugada sin break. Los demás full time tienen su pausa desde tres horas después del ingreso.</p></div>
        <a className="r-settings-plan-link" href="/horarios">Ver horarios y cobertura de la próxima semana</a>
        <a className="r-settings-plan-link" href="/supervisores">Supervisores, asignación de asesores y desempeño</a>
        <a className="r-settings-plan-link" href="/tr">Indicadores TR: estados actuales de AICC</a>
      </div>
    </dialog>
  </>;
}
