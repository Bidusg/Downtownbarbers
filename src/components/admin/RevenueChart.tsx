"use client";

import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#F47721";

type Point = { key?: string; day: string; nok: number };

export function RevenueChart({
  data,
  drillBase,
  period = "days",
}: {
  data: Point[];
  /** Sett for å gjøre grafen klikkbar: naviger til `${drillBase}?dag=|mnd=<key>`. */
  drillBase?: string;
  period?: "days" | "months";
}) {
  const router = useRouter();

  const onClick = (state: unknown) => {
    if (!drillBase) return;
    const p = (state as { activePayload?: { payload?: Point }[] } | null)
      ?.activePayload?.[0]?.payload;
    if (!p?.key || p.nok <= 0) return;
    const param = period === "months" ? "mnd" : "dag";
    router.push(`${drillBase}?${param}=${p.key}`);
  };

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          onClick={onClick}
          margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          style={drillBase ? { cursor: "pointer" } : undefined}
        >
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
            activeDot={drillBase ? { r: 5, fill: BRAND, cursor: "pointer" } : { r: 4, fill: BRAND }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
