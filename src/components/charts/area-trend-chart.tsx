'use client';

/**
 * Shared area-trend chart (recharts).
 *
 * Extracted so recharts (a large dependency) can be loaded with `next/dynamic`
 * ({ ssr: false }) — it stays OUT of each page's initial JS bundle and only
 * downloads when a chart actually renders. Colors come from useChartTheme, so
 * charts follow light/dark automatically.
 *
 * Series take the theme's categorical colours in order (series 1, series 2),
 * and a legend names them, so no line is told apart by colour alone.
 */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useChartTheme } from '@/lib/theme/use-chart-theme';

export interface AreaSeries {
  dataKey: string;
  name: string;
}

interface AreaTrendChartProps {
  data: Record<string, unknown>[];
  /** At most two: one per categorical colour. */
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
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => <span style={{ color: chart.text }}>{value}</span>}
        />
        {series.map((s, index) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            stroke={chart.series[index]}
            strokeWidth={2}
            fill={chart.series[index]}
            fillOpacity={0.13}
            name={s.name}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
