/**
 * 主题字体兼容层。
 *
 * 历史实现从 next/font/google 顶层导入了 14 个 Google 字体，构建期会逐个
 * 请求 fonts.googleapis.com；在离线或受限网络环境下会拖慢甚至阻断构建。
 * 且经核查，这些字体变量除 --font-sans 外均未在项目样式表中实际使用，
 * 整个模块也没有被任何页面引用，属于模板残留。
 *
 * 现在字体统一由 globals.css 中 :root 的系统字体栈提供
 * （--font-body / --font-display / --font-mono），不产生任何网络请求或
 * 构建期副作用。保留 fontVariables 导出（字符串类型）以防后续代码引用。
 *
 * 依据：modern-web-guidance performance.md（消除第三方字体请求、保证构建可复现）。
 */
export const fontVariables = '';

/** 主题字体回退栈，供需要的组件显式引用。 */
export const themeFontFallbacks = {
  sans: 'var(--font-body), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: 'Georgia, "Times New Roman", serif',
} as const;
