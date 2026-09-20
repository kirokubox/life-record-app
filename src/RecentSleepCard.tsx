import { useMemo, useState } from "react";
import { formatDuration, sevenDaySleepAverage } from "./calculations";
import { buildSleepChartPoints, formatChartTime } from "./chartData";
import { formatDateJa } from "./dateUtils";
import type { LifeRecord } from "./types";

export function RecentSleepCard({ records, boundary, onOpenDate }: { records: LifeRecord[]; boundary: string; onOpenDate: (date: string) => void }) {
  const points = useMemo(() => buildSleepChartPoints(records, boundary), [records, boundary]);
  const average = useMemo(() => formatDuration(sevenDaySleepAverage(records, boundary)), [records, boundary]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = points.find((point) => point.date === selectedDate) ?? null;
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 44, bottom: 36, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxSleep = Math.max(4, Math.ceil(Math.max(...points.map((point) => point.totalHours ?? 0), 0)));
  const wakeValues = points.map((point) => point.wakeTime).filter((value): value is number => value !== null);
  const wakeMin = Math.max(0, Math.floor((wakeValues.length ? Math.min(...wakeValues) : 4) - 0.5));
  const wakeMax = Math.min(24, Math.ceil((wakeValues.length ? Math.max(...wakeValues) : 8) + 0.5));
  const wakeRange = Math.max(1, wakeMax - wakeMin);
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const barWidth = Math.min(24, Math.max(10, plotWidth / Math.max(points.length, 1) - 12));
  const xOf = (index: number) => padding.left + index * xStep;
  const sleepY = (hours: number) => padding.top + plotHeight - (hours / maxSleep) * plotHeight;
  const linePoints = points.map((point, index) => point.wakeTime === null ? null : `${xOf(index)},${padding.top + ((wakeMax - point.wakeTime) / wakeRange) * plotHeight}`).filter((value): value is string => value !== null).join(" ");
  const sleepTicks = [0, Math.ceil(maxSleep / 2), maxSleep];
  const wakeTicks = [wakeMin, wakeMin + wakeRange / 2, wakeMax];
  const hasData = points.some((point) => point.totalHours !== null || point.wakeTime !== null);

  return <section className="chart-card">
    <div className="chart-card-head"><div><h2>最近の眠り</h2><p>棒：睡眠・仮眠　線：起床</p></div><span>直近7日平均：{average}</span></div>
    {!hasData ? <p className="empty">最近の眠りを表示するには、起床時間と睡眠時間を記録してください。</p> : <>
      <div className="chart-wrap"><svg className="sleep-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="直近14日分の睡眠時間と起床時間">
        <rect className="sleep-chart-bg" width={width} height={height} rx="8" />
        {sleepTicks.map((tick) => <g key={`sleep-${tick}`}><line className="sleep-grid-line" x1={padding.left} x2={width - padding.right} y1={sleepY(tick)} y2={sleepY(tick)} /><text className="sleep-axis right" x={width - 8} y={sleepY(tick) + 4}>{tick}h</text></g>)}
        {wakeTicks.map((tick) => <text className="sleep-axis left" key={`wake-${tick}`} x={8} y={padding.top + ((wakeMax - tick) / wakeRange) * plotHeight + 4}>{formatChartTime(tick)}</text>)}
        {points.map((point, index) => { const x = xOf(index); const sleep = point.sleepHours ?? 0; const nap = point.totalHours === null ? 0 : point.napHours; const base = padding.top + plotHeight; const sleepHeight = plotHeight - (sleepY(sleep) - padding.top); const napHeight = nap / maxSleep * plotHeight; return <g key={point.date}>
          {selectedDate === point.date && <rect className="sleep-col-highlight" x={x - xStep / 2} y={padding.top} width={xStep} height={plotHeight} rx="4" />}
          {point.totalHours !== null && <><rect className="sleep-bar-main" x={x - barWidth / 2} y={base - sleepHeight} width={barWidth} height={sleepHeight} rx="4" />{nap > 0 && <rect className="sleep-bar-nap" x={x - barWidth / 2} y={base - sleepHeight - napHeight} width={barWidth} height={napHeight} rx="4" />}</>}
          {(points.length <= 8 || index % 2 === 0 || index === points.length - 1) && <text className="sleep-axis date" x={x} y={height - 10}>{point.label}</text>}
          <rect className="sleep-hit" x={x - xStep / 2} y={padding.top} width={xStep} height={plotHeight + padding.bottom - 6} onClick={() => setSelectedDate(selectedDate === point.date ? null : point.date)} />
        </g>; })}
        {linePoints && <polyline className="wake-line" points={linePoints} />}
        {points.map((point, index) => point.wakeTime === null ? null : <circle className="wake-dot" cx={xOf(index)} cy={padding.top + ((wakeMax - point.wakeTime) / wakeRange) * plotHeight} key={`wake-dot-${point.date}`} r="4" />)}
      </svg></div>
      {selected && <div className="chart-detail"><strong>{formatDateJa(selected.date)}</strong><span>就寝 {selected.bedTime ?? "-"}　起床 {formatChartTime(selected.wakeTime)}　睡眠 {selected.sleepHours === null ? "-" : `${selected.sleepHours.toFixed(1)}h`}　仮眠 {selected.napHours.toFixed(1)}h</span><button onClick={() => onOpenDate(selected.date)}>この日を開く</button></div>}
    </>}
  </section>;
}
