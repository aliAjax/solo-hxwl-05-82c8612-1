import { FormEvent, useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  ALL_FILTER,
  LIMITS,
  TANK_TYPES,
  TankRecord,
  checkRecord,
  collectViolations,
  createId,
  formatTime,
  loadRecords,
  saveRecords,
  toCSV,
} from "./ledger";

const project = {
  id: "hxwl-05",
  port: 5105,
  title: "水族箱水质监测",
  subtitle: "多鱼缸水质趋势、换水和异常指标提醒",
  stack: "React + Vite + TypeScript + CSS",
  domain: "水族养护",
  users: ["水族店员", "玩家", "维护师"],
};

interface FormState {
  tankType: string;
  temperature: string;
  ph: string;
  ammonia: string;
  nitrate: string;
  waterChange: string;
  note: string;
}

const emptyForm: FormState = {
  tankType: "",
  temperature: "",
  ph: "",
  ammonia: "",
  nitrate: "",
  waterChange: "",
  note: "",
};

interface Metric {
  label: string;
  value: string;
  status: "status-ok" | "status-watch" | "status-danger";
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildMetrics(records: TankRecord[]): Metric[] {
  const avgPh = average(records.map((r) => r.ph));
  const maxAmmonia = records.length ? Math.max(...records.map((r) => r.ammonia)) : null;
  const avgNitrate = average(records.map((r) => r.nitrate));

  const phOk = avgPh !== null && avgPh >= LIMITS.ph.min! && avgPh <= LIMITS.ph.max!;
  const ammoniaOk = maxAmmonia !== null && maxAmmonia <= LIMITS.ammonia.max!;
  const nitrateOk = avgNitrate !== null && avgNitrate <= LIMITS.nitrate.max!;

  return [
    { label: "记录总数", value: String(records.length), status: "status-ok" },
    {
      label: "平均 pH",
      value: avgPh === null ? "--" : avgPh.toFixed(1),
      status: avgPh === null ? "status-ok" : phOk ? "status-ok" : "status-danger",
    },
    {
      label: "氨氮峰值",
      value: maxAmmonia === null ? "--" : `${maxAmmonia.toFixed(2)}ppm`,
      status: maxAmmonia === null ? "status-ok" : ammoniaOk ? "status-ok" : "status-danger",
    },
    {
      label: "硝酸盐均值",
      value: avgNitrate === null ? "--" : `${avgNitrate.toFixed(0)}ppm`,
      status: avgNitrate === null ? "status-ok" : nitrateOk ? "status-ok" : "status-danger",
    },
  ];
}

function App() {
  const [records, setRecords] = useState<TankRecord[]>(loadRecords);
  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");

  // 任何记录变动都写回浏览器本地存储，刷新后仍在
  useEffect(() => {
    saveRecords(records);
  }, [records]);

  const filteredRecords = useMemo(
    () => (filter === ALL_FILTER ? records : records.filter((r) => r.tankType === filter)),
    [records, filter]
  );

  const metrics = useMemo(() => buildMetrics(filteredRecords), [filteredRecords]);
  const alerts = useMemo(() => collectViolations(filteredRecords), [filteredRecords]);
  const alertCount = alerts.reduce((sum, item) => sum + item.violations.length, 0);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const temperature = Number(form.temperature);
    const ph = Number(form.ph);
    const ammonia = Number(form.ammonia);
    const nitrate = Number(form.nitrate);
    const waterChange = Number(form.waterChange);

    if (!TANK_TYPES.includes(form.tankType as (typeof TANK_TYPES)[number])) {
      setFormError("请选择缸型");
      return;
    }
    if ([temperature, ph, ammonia, nitrate, waterChange].some((v) => Number.isNaN(v))) {
      setFormError("请完整填写水温、pH、氨氮、硝酸盐和换水量");
      return;
    }

    const record: TankRecord = {
      id: createId(),
      tankType: form.tankType,
      temperature,
      ph,
      ammonia,
      nitrate,
      waterChange,
      note: form.note.trim(),
      createdAt: new Date().toISOString(),
    };
    setRecords((prev) => [record, ...prev]);
    // 保留缸型，方便连续录入同一口缸
    setForm({ ...emptyForm, tankType: form.tankType });
    setFormError("");
  }

  function handleDelete(id: string) {
    if (!window.confirm("确定删除这条记录吗？")) return;
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  function handleExport() {
    const csv = toCSV(filteredRecords);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `水族台账_${filter}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">
            {project.id} · port {project.port}
          </p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <i className={metric.status} />
          </article>
        ))}
      </section>

      {alerts.length > 0 && (
        <section className="alert-banner" role="alert">
          <strong>⚠ {alertCount} 项指标超限，请尽快处理</strong>
          <ul>
            {alerts.map(({ record, violations }) =>
              violations.map((v) => (
                <li key={`${record.id}-${v.label}`}>
                  {record.tankType} · {formatTime(record.createdAt)} — {v.message}
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {[ALL_FILTER, ...TANK_TYPES].map((type) => {
              const count =
                type === ALL_FILTER ? records.length : records.filter((r) => r.tankType === type).length;
              return (
                <button
                  key={type}
                  className={filter === type ? "filter-active" : ""}
                  onClick={() => setFilter(type)}
                >
                  {type}（{count}）
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>新增记录</h2>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="field-grid">
              <label>
                <span>缸型</span>
                <select
                  required
                  value={form.tankType}
                  onChange={(e) => updateField("tankType", e.target.value)}
                >
                  <option value="" disabled>
                    选择缸型
                  </option>
                  {TANK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>水温（°C）</span>
                <input
                  required
                  type="number"
                  step="0.1"
                  min="-5"
                  max="45"
                  placeholder="如 25"
                  value={form.temperature}
                  onChange={(e) => updateField("temperature", e.target.value)}
                />
              </label>
              <label>
                <span>酸碱度 pH</span>
                <input
                  required
                  type="number"
                  step="0.1"
                  min="0"
                  max="14"
                  placeholder="如 6.8"
                  value={form.ph}
                  onChange={(e) => updateField("ph", e.target.value)}
                />
              </label>
              <label>
                <span>氨氮（ppm）</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  placeholder="如 0.05"
                  value={form.ammonia}
                  onChange={(e) => updateField("ammonia", e.target.value)}
                />
              </label>
              <label>
                <span>硝酸盐（ppm）</span>
                <input
                  required
                  type="number"
                  step="0.1"
                  min="0"
                  max="500"
                  placeholder="如 18"
                  value={form.nitrate}
                  onChange={(e) => updateField("nitrate", e.target.value)}
                />
              </label>
              <label>
                <span>换水量（%）</span>
                <input
                  required
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="如 30"
                  value={form.waterChange}
                  onChange={(e) => updateField("waterChange", e.target.value)}
                />
              </label>
              <label className="field-wide">
                <span>备注（可选）</span>
                <input
                  placeholder="如：周末换水、停喂观察"
                  value={form.note}
                  onChange={(e) => updateField("note", e.target.value)}
                />
              </label>
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <div className="submit-row">
              <button type="submit" className="primary-action">
                保存记录
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>本地台账 · 共 {filteredRecords.length} 条</p>
            <h2>{filter === ALL_FILTER ? "全部记录" : `${filter}记录`}</h2>
          </div>
          <button onClick={handleExport} disabled={filteredRecords.length === 0}>
            导出 CSV
          </button>
        </div>
        <div className="record-list">
          {filteredRecords.length === 0 && (
            <p className="empty-state">当前筛选下暂无记录，请在上方新增。</p>
          )}
          {filteredRecords.map((record, index) => {
            const violations = checkRecord(record);
            return (
              <article
                key={record.id}
                className={violations.length > 0 ? "record-card alert" : "record-card"}
              >
                <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>
                    {record.tankType}
                    <span className="record-time">{formatTime(record.createdAt)}</span>
                  </h3>
                  <p>
                    水温 {record.temperature}°C · pH {record.ph} · 氨氮 {record.ammonia}ppm · 硝酸盐{" "}
                    {record.nitrate}ppm · 换水 {record.waterChange}%
                  </p>
                  {record.note && <p className="record-note">备注：{record.note}</p>}
                  {violations.length > 0 && (
                    <div className="violation-list">
                      {violations.map((v) => (
                        <span key={v.label} className="violation-badge">
                          {v.message}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button className="delete-btn" onClick={() => handleDelete(record.id)}>
                  删除
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default App;
