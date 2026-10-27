import { connection } from "next/server";
import "../report.css";
import "../planning.css";
import { HorariosSemana } from "@/components/horarios-semana";

function siguienteLunes() {
  const lima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const fecha = new Date(`${lima}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + ((8 - fecha.getUTCDay()) % 7 || 7));
  return fecha.toISOString().slice(0, 10);
}

export default async function HorariosPage() {
  await connection();
  return <HorariosSemana initialLunes={siguienteLunes()} />;
}
