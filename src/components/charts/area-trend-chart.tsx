'use client';

/**
 * ISSA — Shared area-trend chart (recharts).
 *
 * Extracted so recharts (a large dependency) can be loaded with `next/dynamic`
 * ({ ssr: false }) — it stays OUT of each page's initial JS bundle and only
 * downloads when a chart actually renders. Colors come from useChartTheme, so
 * charts follow light/dark automatically.
 */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useChartTheme } from '@/lib/theme/use-chart-theme';

export interface AreaSeries {
  dataKey: string;
  stroke: string;
  fill: string;
  name: string;
}

interface AreaTrendChartProps {
  data: Record<string, unknown>[];
  series: AreaSeries[];
  height?: number;
  xKey?: string;
  fontSize?: number;
  allowDecimals?: boolean;
}

export default function AreaTrendChart({
  data,
  series,
  height = 200,
  xKey = 'date',
  fontSize = 10,
  allowDecimals = true,
}: AreaTrendChartProps) {
  const chart = useChartTheme();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
        <XAxis dataKey={xKey} stroke={chart.axis} fontSize={fontSize} />
        <YAxis stroke={chart.axis} fontSize={fontSize} allowDecimals={allowDecimals} />
        <Tooltip
          contentStyle={{
            background: chart.tooltipBg,
            border: `1px solid ${chart.tooltipBorder}`,
            borderRadius: 8,
            fontSize: 11,
            color: chart.tooltipText,
          }}
        />
        {series.map((s) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            stroke={s.stroke}
            fill={s.fill}
            name={s.name}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
