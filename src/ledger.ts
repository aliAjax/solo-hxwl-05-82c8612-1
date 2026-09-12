// 水族台账：数据模型、本地存储、指标阈值与导出逻辑

export interface TankRecord {
  id: string;
  tankType: string; // 缸型
  temperature: number; // 水温 °C
  ph: number; // 酸碱度
  ammonia: number; // 氨氮 ppm
  nitrate: number; // 硝酸盐 ppm
  waterChange: number; // 换水量 %
  note: string; // 备注
  createdAt: string; // ISO 时间
}

export const TANK_TYPES = ["草缸", "海缸", "三湖缸", "繁殖缸"] as const;

export const ALL_FILTER = "全部";

export const STORAGE_KEY = "aquarium-ledger-records-v1";
export const FILTER_PREF_KEY = "aquarium-ledger-filter";
export const TREND_METRIC_PREF_KEY = "aquarium-ledger-trend-metric";

/** 趋势视图可切换的指标，与 LIMITS 的键一一对应 */
export const TREND_METRICS = ["temperature", "ph", "ammonia", "nitrate"] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export const METRIC_LABELS: Record<TrendMetric, string> = {
  temperature: "水温",
  ph: "pH",
  ammonia: "氨氮",
  nitrate: "硝酸盐",
};

interface RangeLimit {
  label: string;
  unit: string;
  min?: number;
  max?: number;
}

// 通用安全范围，超出即提醒
export const LIMITS: Record<"temperature" | "ph" | "ammonia" | "nitrate", RangeLimit> = {
  temperature: { label: "水温", unit: "°C", min: 22, max: 28 },
  ph: { label: "pH", unit: "", min: 6.5, max: 8.5 },
  ammonia: { label: "氨氮", unit: "ppm", max: 0.25 },
  nitrate: { label: "硝酸盐", unit: "ppm", max: 40 },
};

export interface Violation {
  label: string;
  message: string;
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 检查单条记录，返回所有超限项 */
export function checkRecord(r: TankRecord): Violation[] {
  const violations: Violation[] = [];
  const checks: Array<[number, RangeLimit]> = [
    [r.temperature, LIMITS.temperature],
    [r.ph, LIMITS.ph],
    [r.ammonia, LIMITS.ammonia],
    [r.nitrate, LIMITS.nitrate],
  ];
  for (const [value, limit] of checks) {
    if (limit.min !== undefined && value < limit.min) {
      violations.push({
        label: limit.label,
        message: `${limit.label} ${fmt(value)}${limit.unit} 低于下限 ${fmt(limit.min)}${limit.unit}`,
      });
    }
    if (limit.max !== undefined && value > limit.max) {
      violations.push({
        label: limit.label,
        message: `${limit.label} ${fmt(value)}${limit.unit} 超过上限 ${fmt(limit.max)}${limit.unit}`,
      });
    }
  }
  return violations;
}

export interface RecordWithViolations {
  record: TankRecord;
  violations: Violation[];
}

/** 取记录的某项指标值 */
export function metricValue(r: TankRecord, metric: TrendMetric): number {
  return r[metric];
}

/** 单项指标是否超限 */
export function isMetricAbnormal(value: number, metric: TrendMetric): boolean {
  const limit = LIMITS[metric];
  if (limit.min !== undefined && value < limit.min) return true;
  if (limit.max !== undefined && value > limit.max) return true;
  return false;
}

/** 汇总一组记录中的超限情况（按记录倒序） */
export function collectViolations(records: TankRecord[]): RecordWithViolations[] {
  return records
    .map((record) => ({ record, violations: checkRecord(record) }))
    .filter((item) => item.violations.length > 0);
}

function isValidRecord(item: unknown): item is TankRecord {
  if (typeof item !== "object" || item === null) return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.tankType === "string" &&
    typeof r.temperature === "number" &&
    typeof r.ph === "number" &&
    typeof r.ammonia === "number" &&
    typeof r.nitrate === "number" &&
    typeof r.waterChange === "number" &&
    typeof r.createdAt === "string"
  );
}

/** 首次打开时的示例台账（沿用原看板的三条示例记录） */
function seedRecords(): TankRecord[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      id: "seed-3",
      tankType: "繁殖缸",
      temperature: 27,
      ph: 7.2,
      ammonia: 0.5,
      nitrate: 25,
      waterChange: 0,
      note: "氨氮升高，停止投喂",
      createdAt: new Date(now).toISOString(),
    },
    {
      id: "seed-2",
      tankType: "海缸",
      temperature: 26,
      ph: 8.1,
      ammonia: 0.02,
      nitrate: 5,
      waterChange: 15,
      note: "钙硬度偏低，需复测",
      createdAt: new Date(now - day).toISOString(),
    },
    {
      id: "seed-1",
      tankType: "草缸",
      temperature: 25,
      ph: 6.8,
      ammonia: 0.05,
      nitrate: 18,
      waterChange: 30,
      note: "硝酸盐18ppm，计划周末换水30%",
      createdAt: new Date(now - 2 * day).toISOString(),
    },
  ];
}

/** 从 localStorage 读取台账；首次访问时写入示例数据 */
export function loadRecords(): TankRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seeds = seedRecords();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
      return seeds;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecord);
  } catch {
    return [];
  }
}

export function saveRecords(records: TankRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 存储满或被禁用时静默失败，页面内数据仍可用
  }
}

/** 读取界面偏好（筛选条件、趋势指标等），刷新后保留 */
export function loadPref(key: string, fallback: string): string {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 同上，静默失败
  }
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 趋势图横轴用的短时间格式 */
export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 生成带 BOM 的 CSV，Excel 打开中文不乱码 */
export function toCSV(records: TankRecord[]): string {
  const header = ["缸型", "水温(°C)", "pH", "氨氮(ppm)", "硝酸盐(ppm)", "换水量(%)", "备注", "记录时间"];
  const rows = records.map((r) => [
    r.tankType,
    r.temperature,
    r.ph,
    r.ammonia,
    r.nitrate,
    r.waterChange,
    r.note,
    formatTime(r.createdAt),
  ]);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
