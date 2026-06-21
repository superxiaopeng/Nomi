import React from "react";
import { IconPhoto, IconUser } from "@tabler/icons-react";
import { cn } from "../../../../utils/cn";
import type { MountedCard } from "../../hooks/useNodeRelationships";

/**
 * 切片2：镜头面「挂了哪些设定卡」徽章（bottom-left caption）——不选中也能一眼看出挂了谁，
 * 免点开数连线（出片前可审计）。最多 2 个 + 「+N」，名字过长截断。角色=IconUser/场景=IconPhoto。
 * 空挂载返回 null（调用方无需再判，保持节点面干净）。
 */
export default function ShotMountBadges({ cards }: { cards: readonly MountedCard[] }): JSX.Element | null {
  if (cards.length === 0) return null;
  return (
    <div
      className={cn(
        "absolute bottom-[10px] left-[10px] z-[2] flex items-center gap-1 max-w-[calc(100%-20px)]",
        "pointer-events-none",
      )}>
      {cards.slice(0, 2).map((card) => (
        <span
          key={card.id}
          title={`挂载：${card.title}`}
          className={cn(
            "inline-flex items-center gap-1 min-w-0 py-[3px] px-2 rounded-nomi-sm",
            "text-micro text-nomi-ink-60 bg-nomi-paper/[0.82] backdrop-blur-[8px]",
          )}>
          {card.kind === "character" ? (
            <IconUser size={11} stroke={1.8} aria-hidden="true" />
          ) : (
            <IconPhoto size={11} stroke={1.8} aria-hidden="true" />
          )}
          <span className="truncate max-w-[88px]">{card.title}</span>
        </span>
      ))}
      {cards.length > 2 ? (
        <span
          title={cards.slice(2).map((card) => card.title).join("、")}
          className={cn(
            "py-[3px] px-2 rounded-nomi-sm text-micro text-nomi-ink-60",
            "bg-nomi-paper/[0.82] backdrop-blur-[8px]",
          )}>
          +{cards.length - 2}
        </span>
      ) : null}
    </div>
  );
}
