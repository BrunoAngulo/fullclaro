import Reporting from "@/components/gtr-dashboard";
import { connection } from "next/server";
import "./report.css";
export default async function Home() {
  await connection();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return <Reporting initialFecha={today} />;
}
