// 渲染层要的 skill 列表 DTO（主进程组装）。按「路 A」：这里只把 manifest 原样给渲染层，
// 能力比对（缺哪个 provider）放渲染层用 getCatalogHealth 做，catalog 一变实时刷新、不耦合。
import { deriveSkillNeeds } from "./skillCapability";
import type { SkillProviderKind } from "./skillManifestSchema";
import { readSkillRecords } from "./skillStore";

export type SkillListItem = {
  directoryName: string;
  name: string;
  /** 人话显示名（manifest.label，缺则回退 name）。 */
  label: string;
  description: string | null;
  author: string | null;
  /** 多段 playbook 的阶段标签（卡片/阶段条展示用；单段 skill 为空）。 */
  stageLabels: string[];
  /** 这个 skill 是不是多段 playbook（有 stages）。 */
  isPlaybook: boolean;
  /**
   * 端到端需要的 provider 模态（deriveSkillNeeds 权威算出 = requiredProviders ∪ stages.modelPrefs.kind）。
   * 渲染层只对它做「减去当前可用」的平凡差集得出缺口——能力派生逻辑只在 electron 一处（不违 P1）。
   */
  neededProviders: SkillProviderKind[];
  /** manifest 解析失败的人话原因（加载期诊断）；正常为 null。 */
  manifestError: string | null;
};

export function listSkillsForRenderer(): SkillListItem[] {
  return readSkillRecords().map((r) => {
    const needs = r.manifest ? deriveSkillNeeds(r.manifest) : null;
    return {
      directoryName: r.directoryName,
      name: r.name,
      label: r.manifest?.label || r.name,
      description: r.manifest?.description ?? null,
      author: r.manifest?.author ?? null,
      stageLabels: (r.manifest?.stages ?? []).map((s) => s.goal),
      isPlaybook: (r.manifest?.stages ?? []).length > 0,
      neededProviders: needs?.providers ?? [],
      manifestError: r.manifestError ?? null,
    };
  });
}
