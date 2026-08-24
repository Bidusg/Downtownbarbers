"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#F47721";

export function RevenueChart({
  data,
}: {
  data: { day: string; nok: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "#9a908a" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9a908a" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v) => `${v / 1000}k`}
          />
          <Tooltip
            cursor={{ stroke: BRAND, strokeOpacity: 0.3 }}
            contentStyle={{
              background: "#211E1A",
              border: "none",
              borderRadius: 0,
              color: "#F8F5EF",
              fontSize: 12,
            }}
            formatter={(v) => [`${Number(v).toLocaleString("nb-NO")} kr`, "Omsetning"]}
          />
          <Area
            type="monotone"
            dataKey="nok"
            stroke={BRAND}
            strokeWidth={2}
            fill="url(#rev)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
