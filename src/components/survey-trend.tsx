"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { SURVEY_METHOD, surveyDay } from "@/lib/survey-scoring";
type Row = {
  id: string;
  surveyDate: string | Date | null;
  method: string;
  overall: number | null;
  zbi: number | null;
  phase?: string;
};
export default function SurveyTrend({ rows }: { rows: Row[] }) {
  const valid = rows
    .filter(
      (r) =>
        r.surveyDate &&
        r.method === SURVEY_METHOD &&
        ["Baseline", "Annual", "Follow-up"].includes(r.phase || ""),
    )
    .sort(
      (a, b) =>
        new Date(a.surveyDate!).getTime() - new Date(b.surveyDate!).getTime(),
    );
  const data = valid.map((r) => ({
    date: new Date(r.surveyDate!).toLocaleDateString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    overall: r.overall,
    zbi: r.zbi,
  }));
  const complete = valid.filter((r) => r.overall !== null),
    latest = complete.at(-1),
    previous = latest
      ? complete.findLast(
          (r) => surveyDay(r.surveyDate!) < surveyDay(latest.surveyDate!),
        )
      : undefined;
  return (
    <div>
      <p>
        Charts show this page of dated responses using the current method. Only
        compare compatible scores. Changes do not establish programme impact.
      </p>
      {previous && latest && (
        <p>
          WHOQOL Overall: {previous.overall} → {latest.overall}. Change:{" "}
          {(latest.overall! - previous.overall!).toFixed(2)} points.
        </p>
      )}
      {[
        ["overall", "P3H WHOQOL Survey Score (0–100)", 100],
        ["zbi", "Six-item ZBI Survey (0–24)", 24],
      ].map(([key, title, max]) => (
        <section key={key} className="survey-chart">
          <h4>{title}</h4>
          {new Set(
            data
              .filter((r) => r[key as "overall" | "zbi"] !== null)
              .map((r) => r.date),
          ).size < 2 ? (
            <p>
              At least two valid survey dates are needed to display a trend.
              Recorded scores remain in the table.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data}>
                <XAxis dataKey="date" />
                <YAxis domain={[0, Number(max)]} />
                <Tooltip />
                <Legend />
                <Line
                  dataKey={String(key)}
                  name={String(title)}
                  stroke="#0f766e"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>
      ))}
    </div>
  );
}

export function SurveyMonthlyTrend({
  rows,
}: {
  rows: {
    month: string;
    overall: number | null;
    zbi: number | null;
    overallCount: number;
    zbiCount: number;
  }[];
}) {
  return (
    <section className="panel">
      <h3>Survey scores over time</h3>
      <p>
        Each point is the average of valid, verified responses that month. The
        caregivers represented may vary by month.
      </p>
      {(
        [
          ["overall", "overallCount", "Monthly WHOQOL Overall (0–100)", 100],
          ["zbi", "zbiCount", "Monthly six-item ZBI (0–24)", 24],
        ] as const
      ).map(([metric, count, title, limit]) => (
        <section className="survey-chart" key={metric}>
          <h4>{title}</h4>
          {rows.filter((row) => row[metric] !== null).length < 2 ? (
            <p>
              At least two months with valid scores are needed for this chart.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rows}>
                <XAxis dataKey="month" />
                <YAxis domain={[0, limit]} />
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${value} (${item.payload[count]} responses)`,
                    title,
                  ]}
                />
                <Line
                  dataKey={metric}
                  name={title}
                  stroke="#0f766e"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>
      ))}
    </section>
  );
}
