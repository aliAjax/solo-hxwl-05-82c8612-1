import {
  LIMITS,
  METRIC_LABELS,
  TANK_TYPES,
  TankRecord,
  TrendMetric,
  formatTime,
  formatTimeShort,
  isMetricAbnormal,
  metricValue,
} from "./ledger";

// 每个缸型一条曲线，颜色按 TANK_TYPES 顺序固定，筛选切换时颜色不漂移
const SERIES_COLORS = ["#0891b2", "#16a34a", "#f59e0b", "#8b5cf6"];

const W = 720;
const H = 260;
const PAD = { left: 48, right: 20, top: 18, bottom: 36 };

interface TrendChartProps {
  records: TankRecord[]; // 已按当前筛选过滤
  metric: TrendMetric;
}

function fmtTick(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export default function TrendChart({ records, metric }: TrendChartProps) {
  const sorted = [...records].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  if (sorted.length === 0) {
    return <p className="empty-state">当前筛选下暂无记录，无法绘制趋势。</p>;
  }

  const limit = LIMITS[metric];
  const unit = limit.unit;
  const times = sorted.map((r) => +new Date(r.createdAt));
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);

  // 值域覆盖数据和阈值线，上下各留 15% 余量
  const values = sorted.map((r) => metricValue(r, metric));
  let vMin = Math.min(...values);
  let vMax = Math.max(...values);
  if (limit.min !== undefined) vMin = Math.min(vMin, limit.min);
  if (limit.max !== undefined) vMax = Math.max(vMax, limit.max);
  if (vMin === vMax) {
    vMin -= 1;
    vMax += 1;
  }
  const pad = (vMax - vMin) * 0.15;
  vMin -= pad;
  vMax += pad;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (t: number) =>
    PAD.left + (tMax === tMin ? innerW / 2 : ((t - tMin) / (tMax - tMin)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - vMin) / (vMax - vMin)) * innerH;

  const series = TANK_TYPES.map((type, i) => ({
    type,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: sorted.filter((r) => r.tankType === type),
  })).filter((s) => s.points.length > 0);

  const gridTicks = [0, 1, 2, 3].map((i) => vMin + ((vMax - vMin) * i) / 3);

  return (
    <div>
      <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img">
        {gridTicks.map((v) => (
          <g key={v}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="tick" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {fmtTick(v)}
            </text>
          </g>
        ))}

        {limit.min !== undefined && (
          <g>
            <line
              className="limit-line"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(limit.min)}
              y2={y(limit.min)}
            />
            <text className="limit-label" x={W - PAD.right} y={y(limit.min) - 5} textAnchor="end">
              下限 {limit.min}
              {unit}
            </text>
          </g>
        )}
        {limit.max !== undefined && (
          <g>
            <line
              className="limit-line"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(limit.max)}
              y2={y(limit.max)}
            />
            <text className="limit-label" x={W - PAD.right} y={y(limit.max) - 5} textAnchor="end">
              上限 {limit.max}
              {unit}
            </text>
          </g>
        )}

        <text className="tick" x={PAD.left} y={H - 10}>
          {formatTimeShort(sorted[0].createdAt)}
        </text>
        <text className="tick" x={W - PAD.right} y={H - 10} textAnchor="end">
          {formatTimeShort(sorted[sorted.length - 1].createdAt)}
        </text>

        {series.map((s) => (
          <g key={s.type}>
            {s.points.length > 1 && (
              <polyline
                className="trend-line"
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                points={s.points
                  .map((r) => `${x(+new Date(r.createdAt))},${y(metricValue(r, metric))}`)
                  .join(" ")}
              />
            )}
            {s.points.map((r) => {
              const value = metricValue(r, metric);
              const abnormal = isMetricAbnormal(value, metric);
              return (
                <circle
                  key={r.id}
                  className={abnormal ? "trend-point abnormal" : "trend-point"}
                  cx={x(+new Date(r.createdAt))}
                  cy={y(value)}
                  r={abnormal ? 6 : 4}
                  fill={abnormal ? "#e11d48" : s.color}
                >
                  <title>{`${r.tankType} · ${formatTime(r.createdAt)} — ${METRIC_LABELS[metric]} ${value}${unit}${
                    abnormal ? "（超限）" : ""
                  }`}</title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="trend-legend">
        {series.map((s) => (
          <span key={s.type} className="legend-item">
            <i style={{ background: s.color }} />
            {s.type}（{s.points.length}）
          </span>
        ))}
        <span className="legend-hint">红色大点为超限异常点，虚线为安全阈值</span>
      </div>
    </div>
  );
}
