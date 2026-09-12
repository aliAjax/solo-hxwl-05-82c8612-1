// 必须在任何 react/react-dom 导入之前执行：
// react-dom 在模块加载时通过 canUseDOM / isEventSupported 探测 DOM 环境，
// 若此时 window/document 不存在，onChange 会退化为 IE polyfill 分支，测试事件失效。
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost:5105/",
  pretendToBeVisual: true,
});
const { window } = dom;

// 把 jsdom 的浏览器全局对象挂到 node 全局，供 React 和业务代码使用
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in (globalThis as Record<string, unknown>))) {
    try {
      (globalThis as Record<string, unknown>)[key] = (window as unknown as Record<string, unknown>)[key];
    } catch {
      // 个别属性只读，跳过
    }
  }
}
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// 导出下载相关 stub：捕获 Blob 与文件名，阻止 jsdom 真的去导航
export let capturedBlob: Blob | null = null;
export let capturedFileName = "";
export function resetCapture() {
  capturedBlob = null;
  capturedFileName = "";
}
(URL as unknown as Record<string, unknown>).createObjectURL = (blob: Blob) => {
  capturedBlob = blob;
  return "blob:mock";
};
(URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
  capturedFileName = this.download;
};
(window as unknown as Record<string, unknown>).confirm = () => true;

export { window };
