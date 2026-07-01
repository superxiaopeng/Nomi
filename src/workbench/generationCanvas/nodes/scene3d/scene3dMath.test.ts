import { describe, it, expect } from "vitest";
import { cameraPoseSampleChanged, followOrbitPolarBounds, type CameraPoseSample } from "./scene3dMath";
import {
  FOLLOW_ORBIT_MAX_POLAR_ANGLE,
  FOLLOW_ORBIT_MIN_POLAR_ANGLE,
} from "./scene3dConstants";

const base: CameraPoseSample = {
  px: 1, py: 2, pz: 3,
  rx: 0.1, ry: 0.2, rz: 0.3,
  tx: 0, ty: 0, tz: 0,
};

describe("cameraPoseSampleChanged", () => {
  it("首帧（prev 为 null）一律视为变化，保证至少回灌一次初始位姿", () => {
    expect(cameraPoseSampleChanged(null, base)).toBe(true);
  });

  it("完全相同的两帧视为未变（相机静止 → 不回调，避免 60fps churn）", () => {
    expect(cameraPoseSampleChanged({ ...base }, { ...base })).toBe(false);
  });

  it("亚 epsilon 的浮点抖动视为未变", () => {
    const jittered: CameraPoseSample = { ...base, px: base.px + 0.00005, rz: base.rz - 0.00003 };
    expect(cameraPoseSampleChanged(base, jittered)).toBe(false);
  });

  it("任一位置分量超过 epsilon 即视为变化", () => {
    expect(cameraPoseSampleChanged(base, { ...base, px: base.px + 0.01 })).toBe(true);
    expect(cameraPoseSampleChanged(base, { ...base, py: base.py - 0.01 })).toBe(true);
    expect(cameraPoseSampleChanged(base, { ...base, pz: base.pz + 0.01 })).toBe(true);
  });

  it("任一旋转分量超过 epsilon 即视为变化", () => {
    expect(cameraPoseSampleChanged(base, { ...base, rx: base.rx + 0.01 })).toBe(true);
    expect(cameraPoseSampleChanged(base, { ...base, ry: base.ry + 0.01 })).toBe(true);
    expect(cameraPoseSampleChanged(base, { ...base, rz: base.rz + 0.01 })).toBe(true);
  });

  it("仅 edit 模式下的 controls target 变化（tx/ty/tz）也算变化", () => {
    expect(cameraPoseSampleChanged(base, { ...base, tx: 0.5 })).toBe(true);
    expect(cameraPoseSampleChanged(base, { ...base, ty: -0.5 })).toBe(true);
    expect(cameraPoseSampleChanged(base, { ...base, tz: 0.5 })).toBe(true);
  });

  it("epsilon 边界：恰等于阈值不算变化，严格大于才算（与 > 实现一致）", () => {
    const eps = 0.0001;
    expect(cameraPoseSampleChanged(base, { ...base, px: base.px + eps })).toBe(false);
    expect(cameraPoseSampleChanged(base, { ...base, px: base.px + eps * 2 })).toBe(true);
  });

  it("自定义 epsilon 生效", () => {
    expect(cameraPoseSampleChanged(base, { ...base, px: base.px + 0.05 }, 0.1)).toBe(false);
    expect(cameraPoseSampleChanged(base, { ...base, px: base.px + 0.2 }, 0.1)).toBe(true);
  });
});

describe("followOrbitPolarBounds", () => {
  it("非跟随态：返回 [0,π] = OrbitControls 默认无约束（退出操控自由 orbit 不变，零回归）", () => {
    const bounds = followOrbitPolarBounds(false);
    expect(bounds.min).toBe(0);
    expect(bounds.max).toBe(Math.PI);
  });

  it("跟随态：返回电影构图带，夹住竖向两极（不到正俯视/正仰视）", () => {
    const bounds = followOrbitPolarBounds(true);
    expect(bounds.min).toBe(FOLLOW_ORBIT_MIN_POLAR_ANGLE);
    expect(bounds.max).toBe(FOLLOW_ORBIT_MAX_POLAR_ANGLE);
  });

  it("跟随带严格收窄于默认 [0,π]：上界不到顶视(0)、下界不到底视(π)", () => {
    const bounds = followOrbitPolarBounds(true);
    expect(bounds.min).toBeGreaterThan(0);
    expect(bounds.max).toBeLessThan(Math.PI);
    expect(bounds.min).toBeLessThan(bounds.max);
  });

  it("构图带落在合理区间（中高俯角 ~ 近水平仰角），主体不会被顶出框", () => {
    const bounds = followOrbitPolarBounds(true);
    // min ≈ 26°(从竖直起算的俯角)：> 15°(不会接近鸟瞰)且 < 水平(π/2)
    expect(bounds.min).toBeGreaterThan(Math.PI * (15 / 180));
    expect(bounds.min).toBeLessThan(Math.PI / 2);
    // max ≈ 100°(略过水平的低角度)：≥ 水平(π/2) 留一点仰拍空间，但 < 110°(远不到贴地正仰视脚底)
    expect(bounds.max).toBeGreaterThanOrEqual(Math.PI / 2);
    expect(bounds.max).toBeLessThan(Math.PI * (110 / 180));
  });
});
