/** Una hora de pausa cada media hora dentro del turno. El break completo
 * debe terminar al menos dos horas antes de la salida (también nocturna). */
export function breakChoices(entrada: string, salida: string) {
  if (!/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida)) return [];
  const minutes = (hour: string) => Number(hour.slice(0, 2)) * 60 + Number(hour.slice(3));
  const format = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const entry = minutes(entrada);
  const duration = (minutes(salida) - entry + 1440) % 1440;
  return Array.from({ length: 48 }, (_, i) => (entry + i * 30) % 1440)
    .filter((start) => {
      const offset = (start - entry + 1440) % 1440;
      return offset + 60 <= duration - 120;
    })
    .map((start) => ({ start: format(start), end: format(start + 60), label: `${format(start)} - ${format(start + 60)}` }));
}
