// 火山方舟（Volcengine Ark）供应商种子。
// 真实 probe 验证（2026-06-19，用户 key）：
//   - 认证：Bearer API key（ark- 开头），核心生成不用 AK/SK V4 签名（那套只在头像素材子系统）。
//   - modelKey 用模型直连名（如 doubao-seedream-5-0-260128），不用推理接入点 endpoint id。
//   - 图片 Seedream **同步**：POST /api/v3/images/generations → { data:[{ url, size }], usage }（data[0].url 即结果）。
//   - 视频 Seedance 异步（/api/v3/contents/generations/tasks）—— 用户尚未开通，待开通后再接。
// baseUrl 裸（不带 /api/v3），path 自带 /api/v3（避双前缀）。
export const VOLCENGINE_VENDOR_SEED = {
  key: "volcengine",
  name: "火山方舟",
  baseUrl: "https://ark.cn-beijing.volces.com",
  authType: "bearer" as const,
  authHeader: "Authorization",
} as const;
