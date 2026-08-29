import type { Kpi, Tone, Trend } from "@/lib/qm-data";

/**
 * Builds a live KPI tile from a current value and (optionally) a trend
 * series. `invert` flips "up is good" to "down is good" — e.g. MTTR or
 * defect leakage, where a falling number is the improvement.
 */
export function liveKpi(
  label: string,
  value: number,
  format: (n: number) => string,
  series?: number[],
  invert: boolean = false
): Kpi {
  const points = series && series.length > 0 ? series : [value];
  const previous = points.length > 1 ? points[points.length - 2] : points[points.length - 1];
  const diff = value - previous;

  const trend: Trend = diff > 0.05 ? "up" : diff < -0.05 ? "down" : "flat";
  const improved = invert ? diff <= 0 : diff >= 0;
  const tone: Tone = trend === "flat" ? "neutral" : improved ? "good" : "warning";

  return {
    label,
    value: format(value),
    delta: `${diff >= 0 ? "+" : ""}${format(diff)}`,
    trend,
    tone,
    spark: points,
  };
}
