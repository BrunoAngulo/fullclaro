const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
const {
  parseReport,
  aggregate,
  groupRows,
  emptyTotals,
} = require("../src/lib/report-parser.ts");
const filename = process.argv[2];
assert.equal(aggregate([]).tnps, null, "No survey must not display as 0%");
assert.equal(aggregate([]).nda, null);
const a = {
  ...emptyTotals(),
  received: 10,
  answered: 9,
  within20: 8,
  within15: 7,
  waitKnown: 9,
  tnpsCount: 1,
  tnpsSum: 1,
};
const b = {
  ...emptyTotals(),
  received: 90,
  answered: 81,
  within20: 54,
  within15: 50,
  waitKnown: 80,
  tnpsCount: 9,
  tnpsSum: -3,
};
assert.equal(aggregate([a, b]).tnps, -20, "Rates must be weighted from counts");
assert.equal(aggregate([a, b]).nda, 90);
assert.equal(
  aggregate([a, b]).ns15,
  null,
  "Missing time must not become a successful 0-second answer",
);
assert.equal(
  aggregate([{ ...emptyTotals(), received: 1, abandoned: 1 }]).nda,
  0,
  "Real zero must remain zero",
);
assert.throws(() => parseReport(Buffer.from("invalid"), "invalid.xlsx"));
if (filename) {
  const dataset = parseReport(fs.readFileSync(filename), "fixture.xlsx");
  const totals = aggregate(dataset.rows);
  for (const [key, expected] of Object.entries(dataset.control))
    assert.ok(
      Math.abs(totals[key] - expected) < 1e-8,
      `Total ${key}: ${totals[key]} vs ${expected}`,
    );
  const daily = groupRows(dataset.rows, "date");
  const source = dataset.sheets.find((s) => s.name === "Diario").rows;
  const keys = [
    "received",
    "answered",
    "within20",
    "abandoned",
    "tmo",
    "tnps",
    "nps",
    "transfer",
    "cat",
    "nda",
    "nds",
    "promoterRate",
    "neutralRate",
    "detractorRate",
  ];
  let checks = 0;
  for (const row of source) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(row[0])) continue;
    const [d, m, y] = row[0].split("/");
    const result = daily.find((r) => r.label === `${y}-${m}-${d}`);
    assert.ok(result);
    keys.forEach((key, i) => {
      assert.ok(
        Math.abs(result[key] - row[i + 1] * (i >= 5 ? 100 : 1)) < 1e-8,
        `${row[0]} ${key}`,
      );
      checks++;
    });
  }
  for (const key of ["agent", "supervisor", "slot", "skill", "direction"]) {
    const grouped = groupRows(dataset.rows, key);
    assert.equal(
      grouped.reduce((n, r) => n + r.received, 0),
      totals.received,
    );
    assert.equal(
      grouped.reduce((n, r) => n + r.records, 0),
      totals.records,
    );
  }
  assert.equal(totals.received, totals.answered + totals.abandoned);
  assert.equal(
    totals.tnpsCount,
    totals.promoters + totals.neutrals + totals.detractors,
  );
  assert.equal(totals.tnpsSum, totals.promoters - totals.detractors);
  console.log(
    `PASS: ${dataset.rows.length} records, ${checks} daily metric checks, ${Object.keys(dataset.control).length} total controls, 5 grouping partitions.`,
  );
}
console.log(
  "PASS: empty denominators, real zeros, weighted aggregation, missing timing, invalid workbook.",
);
