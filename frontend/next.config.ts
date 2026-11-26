import type { NextConfig } from "next";

/**
 * 安全响应头按 MWG 的“分阶段”方式落地：
 * - 强制头只放低风险指令（frame-ancestors / object-src / base-uri），
 *   不限制 script-src，避免打断 Next.js dev/生产所需的内联脚本。
 * - 更完整的策略放在 Report-Only 头里观测，确认无回归后再提升为强制策略。
 * 依据：security.md §1.4、§2.2、§3.2 及 Companion policies（HSTS / nosniff /
 * Referrer-Policy / Permissions-Policy）。
 */
const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=()",
  },
  {
    // HTTP 开发环境下浏览器会忽略 HSTS，不会产生报错。
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: 'report-sample'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
