// 冒烟测试：在 jsdom 中真实渲染 App，验证新增、刷新持久化、筛选、导出、超限提醒和旧看板。
// 运行：npm test（先由 esbuild 打包为 cjs 再用 node 执行）
// 注意：dom-setup 必须第一个导入，见该文件头部注释。
import { capturedBlob, capturedFileName, resetCapture, window } from "./dom-setup";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import App from "../src/App";
import { STORAGE_KEY } from "../src/ledger";

let failures = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const bodyText = () => document.body.textContent || "";
const cards = () => Array.from(document.querySelectorAll(".record-card"));
const storedRecords = (): Array<Record<string, unknown>> =>
  JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof window.HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  const eventName = el instanceof window.HTMLSelectElement ? "change" : "input";
  el.dispatchEvent(new window.Event(eventName, { bubbles: true }));
}

function fillAndSubmit(values: {
  tankType: string;
  temperature: string;
  ph: string;
  ammonia: string;
  nitrate: string;
  waterChange: string;
  note?: string;
}) {
  const form = document.querySelector("form")!;
  const select = form.querySelector("select")!;
  const inputs = Array.from(form.querySelectorAll("input"));
  act(() => {
    setValue(select, values.tankType);
    setValue(inputs[0], values.temperature);
    setValue(inputs[1], values.ph);
    setValue(inputs[2], values.ammonia);
    setValue(inputs[3], values.nitrate);
    setValue(inputs[4], values.waterChange);
    if (values.note !== undefined) setValue(inputs[5], values.note);
  });
  act(() => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

function clickButton(text: string) {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent || "").includes(text)
  );
  if (!btn) throw new Error(`找不到按钮：${text}`);
  act(() => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function clickCardButton(cardText: string, selector: string) {
  const card = cards().find((c) => (c.textContent || "").includes(cardText));
  if (!card) throw new Error(`找不到记录卡片：${cardText}`);
  const btn = card.querySelector(selector)!;
  act(() => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function submitForm() {
  const form = document.querySelector("form")!;
  act(() => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

const formInputs = () => Array.from(document.querySelectorAll("form input")) as HTMLInputElement[];
const formSelect = () => document.querySelector("form select") as HTMLSelectElement;
const submitButton = () =>
  Array.from(document.querySelectorAll("form button")).find((b) => b.getAttribute("type") === "submit")!;

async function main() {
  const container = document.getElementById("root")!;
  let root: Root = createRoot(container);
  act(() => {
    root.render(<App />);
  });

  console.log("\n[1] 旧看板保持正常");
  check("标题仍是 水族箱水质监测", document.querySelector("h1")?.textContent === "水族箱水质监测");
  check("角色区完整", ["水族店员", "玩家", "维护师"].every((t) => bodyText().includes(t)));
  check("指标卡 4 张", document.querySelectorAll(".metric-card").length === 4);
  check("首次打开写入 3 条示例记录", cards().length === 3 && storedRecords().length === 3);
  check("示例记录内容保留（草缸/海缸/繁殖缸）", ["草缸", "海缸", "繁殖缸"].every((t) => bodyText().includes(t)));

  console.log("\n[2] 超限提醒");
  const banner = document.querySelector(".alert-banner");
  check("存在超限提醒横幅", banner !== null);
  check("繁殖缸氨氮超限被点名", (banner?.textContent || "").includes("繁殖缸") && (banner?.textContent || "").includes("氨氮 0.5ppm 超过上限 0.25ppm"));
  check("超标记录卡片带 alert 样式", document.querySelectorAll(".record-card.alert").length === 1);
  check("超标记录显示超限徽标", bodyText().includes("氨氮 0.5ppm 超过上限 0.25ppm"));

  console.log("\n[3] 新增记录");
  fillAndSubmit({ tankType: "海缸", temperature: "26", ph: "8.2", ammonia: "0.01", nitrate: "10", waterChange: "20", note: "测试新增" });
  check("新增后列表 4 条", cards().length === 4);
  check("新记录出现在列表最前", (cards()[0].textContent || "").includes("海缸") && (cards()[0].textContent || "").includes("测试新增"));
  const first = storedRecords()[0];
  check(
    "新记录字段完整写入 localStorage",
    storedRecords().length === 4 &&
      first.tankType === "海缸" &&
      first.temperature === 26 &&
      first.ph === 8.2 &&
      first.ammonia === 0.01 &&
      first.nitrate === 10 &&
      first.waterChange === 20 &&
      first.note === "测试新增",
    JSON.stringify(first)
  );
  check("记录总数指标卡更新为 4", document.querySelector(".metric-card strong")?.textContent === "4");

  fillAndSubmit({ tankType: "三湖缸", temperature: "32", ph: "7.8", ammonia: "0.1", nitrate: "20", waterChange: "10", note: "测试超限" });
  check("第二条新增后列表 5 条", cards().length === 5);
  check("水温超限触发新提醒", bodyText().includes("水温 32°C 超过上限 28°C"));
  check("超限横幅统计 2 条记录", (document.querySelector(".alert-banner ul")?.children.length || 0) === 2);

  console.log("\n[4] 刷新后记录还在");
  act(() => root.unmount());
  const container2 = document.createElement("div");
  document.body.appendChild(container2);
  root = createRoot(container2);
  act(() => {
    root.render(<App />);
  });
  check("重新挂载后仍是 5 条", cards().length === 5);
  check("新增的记录刷新后仍在", bodyText().includes("测试新增") && bodyText().includes("测试超限"));
  check("超限提醒刷新后仍在", bodyText().includes("水温 32°C 超过上限 28°C"));

  console.log("\n[5] 筛选");
  clickButton("草缸");
  check("筛选草缸后只剩 1 条", cards().length === 1 && (cards()[0].textContent || "").includes("草缸"));
  check("筛选按钮带激活态", !!document.querySelector(".chips.muted button.filter-active"));
  clickButton("海缸");
  check("筛选海缸后 2 条（示例+新增）", cards().length === 2);
  clickButton("全部");
  check("回到全部后 5 条", cards().length === 5);

  console.log("\n[6] 导出按当前筛选条件");
  clickButton("草缸");
  resetCapture();
  clickButton("导出 CSV");
  check("已生成导出文件", capturedBlob !== null);
  check("文件名含筛选条件", capturedFileName.includes("草缸") && capturedFileName.endsWith(".csv"), capturedFileName);
  const buf = new Uint8Array(capturedBlob ? await capturedBlob.arrayBuffer() : new ArrayBuffer(0));
  check("CSV 带 BOM 头（Excel 中文不乱码）", buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf);
  let csv = new TextDecoder("utf-8").decode(buf);
  check("CSV 表头正确", csv.includes("缸型,水温(°C),pH,氨氮(ppm),硝酸盐(ppm),换水量(%),备注,记录时间"));
  check("CSV 只含草缸数据", csv.includes("草缸") && !csv.includes("海缸") && !csv.includes("繁殖缸") && !csv.includes("三湖缸"));
  clickButton("全部");
  resetCapture();
  clickButton("导出 CSV");
  csv = capturedBlob ? await capturedBlob.text() : "";
  check("全部导出为 5 条数据+表头", csv.trim().split("\r\n").length === 6, `实际 ${csv.trim().split("\r\n").length} 行`);

  console.log("\n[7] 趋势视图渲染");
  check("趋势图 SVG 渲染", document.querySelector("svg.trend-chart") !== null);
  check("默认指标为水温", document.querySelector(".metric-tabs button.filter-active")?.textContent === "水温");
  check("标题为水温变化曲线", bodyText().includes("水温变化曲线"));
  check("曲线点数量等于当前记录数 5", document.querySelectorAll("circle.trend-point").length === 5);
  check("海缸 2 条记录连成 1 条折线", document.querySelectorAll("polyline.trend-line").length === 1);
  check("图例覆盖 4 种缸型", document.querySelectorAll(".trend-legend .legend-item").length === 4);
  check("水温上下限 2 条阈值线", document.querySelectorAll("line.limit-line").length === 2);

  console.log("\n[8] 指标切换与异常点");
  clickButton("氨氮");
  check("切换到氨氮 tab", document.querySelector(".metric-tabs button.filter-active")?.textContent === "氨氮");
  check("标题变为氨氮变化曲线", bodyText().includes("氨氮变化曲线"));
  check("氨氮异常点 1 个（繁殖缸 0.5ppm）", document.querySelectorAll("circle.trend-point.abnormal").length === 1);
  check("氨氮只有上限 1 条阈值线", document.querySelectorAll("line.limit-line").length === 1);
  clickButton("水温");
  check("水温异常点 1 个（三湖缸 32°C）", document.querySelectorAll("circle.trend-point.abnormal").length === 1);

  console.log("\n[9] 筛选联动趋势");
  clickButton("草缸");
  check("筛选草缸后趋势只剩 1 个点", document.querySelectorAll("circle.trend-point").length === 1);
  check("图例只剩草缸", document.querySelectorAll(".trend-legend .legend-item").length === 1);
  check("单点无折线", document.querySelectorAll("polyline.trend-line").length === 0);
  clickButton("海缸");
  check("筛选海缸后趋势 2 个点 1 条折线", document.querySelectorAll("circle.trend-point").length === 2 && document.querySelectorAll("polyline.trend-line").length === 1);
  clickButton("全部");
  check("回到全部后趋势 5 个点", document.querySelectorAll("circle.trend-point").length === 5);

  console.log("\n[10] 刷新后保留趋势设置");
  clickButton("氨氮");
  clickButton("海缸");
  act(() => root.unmount());
  const container3 = document.createElement("div");
  document.body.appendChild(container3);
  root = createRoot(container3);
  act(() => {
    root.render(<App />);
  });
  check("刷新后趋势指标仍是氨氮", document.querySelector(".metric-tabs button.filter-active")?.textContent === "氨氮");
  check("刷新后筛选仍是海缸", Array.from(document.querySelectorAll(".chips.muted button.filter-active")).some((b) => (b.textContent || "").includes("海缸")));
  check("刷新后趋势跟随筛选（海缸 2 个点）", document.querySelectorAll("circle.trend-point").length === 2);
  check("刷新后记录列表跟随筛选（2 条）", cards().length === 2);
  clickButton("全部");
  check("恢复全部后 5 条", cards().length === 5);

  console.log("\n[11] 删除记录");
  const before = cards().length;
  const deleteBtn = cards()[0].querySelector(".delete-btn")!;
  act(() => {
    deleteBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  check("删除后列表减 1", cards().length === before - 1);
  check("localStorage 同步减 1", storedRecords().length === before - 1);

  console.log("\n[12] 编辑记录并保存");
  const editTarget = storedRecords().find((r) => r.note === "测试新增")!;
  clickCardButton("测试新增", ".edit-btn");
  check("进入编辑模式", bodyText().includes("编辑记录"));
  check("提交按钮变为保存修改", submitButton().textContent === "保存修改");
  check("出现取消按钮", Array.from(document.querySelectorAll("form button")).some((b) => b.textContent === "取消"));
  check("提示正在编辑的记录", bodyText().includes("正在编辑：海缸"));
  check(
    "表单回填缸型和各项指标",
    formSelect().value === "海缸" &&
      formInputs()[0].value === "26" &&
      formInputs()[1].value === "8.2" &&
      formInputs()[2].value === "0.01" &&
      formInputs()[3].value === "10" &&
      formInputs()[4].value === "20" &&
      formInputs()[5].value === "测试新增"
  );
  act(() => {
    setValue(formInputs()[0], "29");
    setValue(formInputs()[5], "已编辑");
  });
  submitForm();
  const edited = storedRecords().find((r) => r.id === editTarget.id)!;
  check("保存后写回同一条记录", edited.temperature === 29 && edited.note === "已编辑" && storedRecords().length === 4);
  check("记录时间和 id 保持不变", edited.createdAt === editTarget.createdAt && edited.id === editTarget.id);
  check("列表同步显示修改", (cards()[0].textContent || "").includes("水温 29") && bodyText().includes("已编辑"));
  check("保存后退出编辑模式", submitButton().textContent === "保存记录" && bodyText().includes("新增记录"));
  check("超限提醒同步更新（29°C 超限）", bodyText().includes("水温 29°C 超过上限 28°C"));
  clickButton("水温");
  check("趋势同步标出异常点", document.querySelectorAll("circle.trend-point.abnormal").length === 1);

  console.log("\n[13] 取消不写入");
  clickCardButton("已编辑", ".edit-btn");
  check("再次进入编辑模式", bodyText().includes("编辑记录"));
  act(() => {
    setValue(formInputs()[0], "15");
    setValue(formInputs()[5], "不应保存");
  });
  clickButton("取消");
  check("取消后回到新增模式", bodyText().includes("新增记录") && submitButton().textContent === "保存记录");
  check("取消后表单清空", formInputs()[0].value === "" && formInputs()[5].value === "");
  check(
    "取消的修改未写入 localStorage",
    !JSON.stringify(storedRecords()).includes("不应保存") &&
      storedRecords().find((r) => r.id === editTarget.id)!.temperature === 29
  );
  check("列表未受取消影响", cards().length === 4 && !bodyText().includes("不应保存"));

  console.log("\n[14] 编辑联动筛选和趋势");
  clickCardButton("草缸", ".edit-btn");
  act(() => {
    setValue(formSelect(), "三湖缸");
  });
  submitForm();
  check(
    "缸型修改已写入存储",
    storedRecords().filter((r) => r.tankType === "三湖缸").length === 1 &&
      storedRecords().filter((r) => r.tankType === "草缸").length === 0
  );
  check("全部筛选下仍是 4 条", cards().length === 4);
  check("趋势总点数仍为 4", document.querySelectorAll("circle.trend-point").length === 4);
  clickButton("草缸");
  check("草缸筛选下列表为空", cards().length === 0 && bodyText().includes("当前筛选下暂无记录"));
  check("草缸筛选下趋势为空状态", bodyText().includes("无法绘制趋势"));
  check(
    "草缸筛选下导出禁用",
    (Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("导出")) as HTMLButtonElement)
      .disabled
  );
  clickButton("三湖缸");
  check("三湖缸筛选出改过来的记录", cards().length === 1 && (cards()[0].textContent || "").includes("三湖缸"));
  check("趋势跟随显示 1 个点", document.querySelectorAll("circle.trend-point").length === 1);
  clickButton("全部");
  check("恢复全部后 4 条", cards().length === 4);

  console.log("\n[15] 刷新后编辑结果保留");
  act(() => root.unmount());
  const container4 = document.createElement("div");
  document.body.appendChild(container4);
  root = createRoot(container4);
  act(() => {
    root.render(<App />);
  });
  check("刷新后仍是 4 条", cards().length === 4);
  check("刷新后指标修改保留", bodyText().includes("已编辑") && bodyText().includes("水温 29"));
  check(
    "刷新后缸型修改保留",
    storedRecords().some((r) => r.tankType === "三湖缸") && !storedRecords().some((r) => r.tankType === "草缸")
  );
  check("刷新后趋势正常渲染", document.querySelectorAll("circle.trend-point").length === 4);
  check("刷新后表单处于新增模式", bodyText().includes("新增记录") && submitButton().textContent === "保存记录");

  act(() => root.unmount());

  console.log(failures === 0 ? "\n全部检查通过 ✅" : `\n${failures} 项检查失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("测试执行异常：", err);
  process.exit(1);
});
