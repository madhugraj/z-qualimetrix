import type { Tone } from "@/lib/qm-data";

const toneVar: Record<Tone, string> = {
  good: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
  ops: "var(--ops)",
  neutral: "var(--muted-foreground)",
};

interface CircularProgressProps {
  value: number;
  label: string;
  caption?: string;
  tone?: Tone;
  size?: number;
}

export function CircularProgress({
  value,
  label,
  caption,
  tone = "good",
  size = 148,
}: CircularProgressProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(value, 0), 100) / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={toneVar[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight">{value}%</span>
          {caption && <span className="text-[11px] text-muted-foreground">{caption}</span>}
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
