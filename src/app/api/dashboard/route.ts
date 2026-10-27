import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

type RawRecord = RowDataPacket & Record<string, string | number | null>;

function numeric(value: string | number | null): number {
  return value === null ? 0 : Number(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaign = (searchParams.get("campaign") || "FULL CLARO").trim().toUpperCase();
  const month = searchParams.get("month") || "";
  const requestedDate = searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "El mes debe tener formato AAAA-MM." }, { status: 400 });
  }

  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);

  const [dailyRows] = await db.query<RawRecord[]>(
    `SELECT DATE_FORMAT(service_date, '%Y-%m-%d') AS date,
            SUM(planned_calls) AS calls,
            SUM(planned_hours) AS hours,
            MAX(required_advisors) AS advisors
       FROM dimension_intervals
      WHERE campaign_name = ? AND service_date >= ? AND service_date < ?
      GROUP BY service_date
      ORDER BY service_date`,
    [campaign, start, end],
  );
  const [weeklyRows] = await db.query<RawRecord[]>(
    `SELECT CONCAT(DATE_FORMAT(MIN(service_date), '%d/%m'), ' – ', DATE_FORMAT(MAX(service_date), '%d/%m')) AS week,
            SUM(planned_calls) AS calls,
            SUM(planned_hours) AS hours,
            MAX(required_advisors) AS advisors
       FROM dimension_intervals
      WHERE campaign_name = ? AND service_date >= ? AND service_date < ?
      GROUP BY YEARWEEK(service_date, 3)
      ORDER BY MIN(service_date)`,
    [campaign, start, end],
  );
  const [monthRows] = await db.query<RawRecord[]>(
    `SELECT DATE_FORMAT(service_date, '%Y-%m') AS month,
            SUM(planned_calls) AS calls,
            SUM(planned_hours) AS hours,
            MAX(required_advisors) AS advisors
       FROM dimension_intervals
      WHERE campaign_name = ?
      GROUP BY DATE_FORMAT(service_date, '%Y-%m')
      ORDER BY month`,
    [campaign],
  );
  const [kpiRows] = await db.query<RawRecord[]>(
    `SELECT SUM(planned_calls) AS calls,
            SUM(planned_hours) AS hours,
            MAX(required_advisors) AS advisors,
            SUM(planned_calls * planned_tmg_seconds) / NULLIF(SUM(planned_calls), 0) AS weighted_tmg
       FROM dimension_intervals
      WHERE campaign_name = ? AND service_date >= ? AND service_date < ?`,
    [campaign, start, end],
  );
  const [availableMonths] = await db.query<RawRecord[]>(
    `SELECT DISTINCT DATE_FORMAT(service_date, '%Y-%m') AS month
       FROM dimension_intervals
      WHERE campaign_name = ?
      ORDER BY month DESC`,
    [campaign],
  );
  const detailDate = requestedDate || String(dailyRows[0]?.date ?? "");
  const validDetailDate = /^\d{4}-\d{2}-\d{2}$/.test(detailDate) ? detailDate : "";
  const [intervalRows] = validDetailDate
    ? await db.query<RawRecord[]>(
        `SELECT TIME_FORMAT(time_slot, '%H:%i') AS time_slot,
                planned_calls AS calls,
                planned_hours AS hours,
                required_advisors AS advisors,
                planned_tmg_seconds AS tmg
           FROM dimension_intervals
          WHERE campaign_name = ? AND service_date = ?
          ORDER BY time_slot`,
        [campaign, validDetailDate],
      )
    : [[] as RawRecord[]];

  return NextResponse.json(
    {
      daily: dailyRows.map((row) => ({ date: row.date, calls: numeric(row.calls), hours: numeric(row.hours), advisors: numeric(row.advisors) })),
      weekly: weeklyRows.map((row) => ({ week: row.week, calls: numeric(row.calls), hours: numeric(row.hours), advisors: numeric(row.advisors) })),
      monthly: monthRows.map((row) => ({ month: row.month, calls: numeric(row.calls), hours: numeric(row.hours), advisors: numeric(row.advisors) })),
      kpis: {
        calls: numeric(kpiRows[0]?.calls ?? 0),
        hours: numeric(kpiRows[0]?.hours ?? 0),
        advisors: numeric(kpiRows[0]?.advisors ?? 0),
        weightedTmg: numeric(kpiRows[0]?.weighted_tmg ?? 0),
      },
      availableMonths: availableMonths.map((row) => String(row.month)),
      detailDate: validDetailDate,
      intervals: intervalRows.map((row) => ({
        timeSlot: String(row.time_slot),
        calls: numeric(row.calls),
        hours: numeric(row.hours),
        advisors: numeric(row.advisors),
        tmg: numeric(row.tmg),
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
}
