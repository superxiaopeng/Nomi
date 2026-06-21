# 站位参考 · 用户旅途级评测（A 层 builder/渲染覆盖）

> 2026-06-21。24 个覆盖矩阵的 spec（1–5 人 × layout × 朝向 × 机位 × 动作）→ 真 Scene3DAutoCapture 出图 → 逐张人眼判断「角色数/动作/朝向/机位/可读性」。配 [[staging-reference-tool-shipped]]。

## 怎么跑

`pnpm dev:renderer` → 截 `http://127.0.0.1:5173/staging-eval.html?page=0..3`（每页 6 例）。用例在 `src/devlab/stagingEval.tsx`，改 spec 即扩展。改 builder 后重截对比。

## 第一轮发现（24 例）

**判对的（17/24）**：单人站立/指向、双人对峙(面对面侧身清楚)、并排、坐站访谈、三/四/五人并排、混合朝向(camera/away/left 清楚生效)、背面机位、顶视环绕(顶视看圈最清)、混合动作、纵深+俯角。→ 多角色/多朝向**基本能做好**。

**判错/偏弱的（系统性，已分类）**：
| # | 问题 | 根因 | 处理 |
|---|---|---|---|
| 06 | behind+侧机位→像并排无纵深 | layout 与 camera 不匹配，侧机位沿纵深轴看 | ✅ 修：按 layout 给默认机位(behind→3/4高) |
| 10 | line+3/4→三人重叠难分 | 纵队从斜角堆叠 | ✅ 修：line 默认侧机位→侧身排开清晰 |
| 11/13 | circle+正面→挤成一团 | 正面看圈，前排背对挡后排 | 🟡 部分：circle 默认 high(比 eye 好)；纯方位仍顶视最清(已写进指引) |
| 21 | close+facing→两人间大片空 | facing 间距固定，近景没收紧 | ✅ 修：间距按景别缩放(close×0.62) |
| 08 | point 不瞄准具名目标 | point 是固定手势、方向身体相对、facing 也救不回 | 📝 限制：工具描述诚实标注「point 是手势非精确瞄准」 |
| 16 | 5+ 人颜色循环撞色(第5又红) | ROLE_COLOR_SEQUENCE 仅 4 色 | 📝 限制：4 人内无碍，5+ 罕见，未扩 |

另：群众实例化有条细横线小瑕疵(19，cosmetic)；agent 偶选 night 致深背景(默认 studio 浅色 OK)。

## 修复（根因·通用，非逐例补）

1. **按 layout 给默认机位** `LAYOUT_CAMERA_DEFAULT`（agent 省略 camera 时）：circle→high、line→side、behind→3/4 high、facing→3/4。→ 06/10/11 重跑明显改善。
2. **间距按景别缩放** `SHOT_SPACING_SCALE`（close 0.62 / medium 1 / wide 1.15）。→ 21 近景收紧。
3. **工具描述加取景指引**：不确定机位就省略(系统按 layout 自动取景)、who-surrounds-whom 用 circle、confront 用 facing、point/wave 是手势非精确瞄准。

第二轮重跑确认：06 纵深✓、10 纵队可读✓、21 近景✓、11 部分改善。

## 已知限制（记录，未修）

- point/wave 不精确指向具名目标（手势级）。要精确瞄准需按目标反算朝向——v1 范围外。
- circle 纯方位关系顶视最清；front/high 是「能看脸+大致看圈」的折中。
- 5+ 人身份撞色。

## 待办（B 层 · agent 选择质量）

NL 旅途 → agent 产 spec → 渲染 → 判 agent 选的 layout/facing/camera 对不对（验「指引是否让 agent 用对默认/布局」）。复用 `tests/ux/staging-reference.e2e.mjs` 模式，gated 文本额度。
