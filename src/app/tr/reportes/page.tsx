import "../../tr.css";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { TrReportDownload } from "@/components/tr-report-download";

export default function ReportesAiccPage() {
  return <main className="tr-app"><div className="tr-shell">
    <header className="tr-header"><a href="/tr" className="tr-back"><ArrowLeft size={16}/> Indicadores TR</a><span className="tr-brand"><FileSpreadsheet size={16}/> REPORTES AICC</span></header>
    <section className="tr-title"><div><span>LECTURA DE REPORTES</span><h1>Trazabilidad y cambios de asesor<span>.</span></h1><p>Configura cada reporte por separado. Esta pantalla no se mezcla con el monitoreo de llamadas actuales.</p></div></section>
    <TrReportDownload cookie="" />
  </div></main>;
}
