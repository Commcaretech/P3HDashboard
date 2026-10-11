"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
export function Chart({
  title,
  values,
  href,
}: {
  title: string;
  values: { name: string; count: number }[];
  href: string;
}) {
  return (
    <section className="panel">
      <h2>
        <a href={href}>{title}</a>
      </h2>
      {values.length ? (
        <div style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={values.slice(0, 12)}
              margin={{ top: 10, right: 15, left: 0, bottom: 50 }}
            >
              <XAxis
                dataKey="name"
                angle={-25}
                textAnchor="end"
                interval={0}
                fontSize={11}
              />
              <YAxis allowDecimals={false} width={28} />
              <Tooltip />
              <Bar
                dataKey="count"
                fill="#286a62"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty">No data recorded yet.</p>
      )}
    </section>
  );
}
