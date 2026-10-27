import { connection } from "next/server";
import { Supervisores } from "@/components/supervisores";
import "../supervision.css";

export default async function SupervisoresPage() {
  await connection();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <Supervisores today={today} />;
}
