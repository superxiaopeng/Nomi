// 设计保真自动走查(规则 8/13 的固化)——把 v4 实现规范 §1/§2/§5 的精确值写成断言,
// 用真 app 的 computed style / DOM 结构核对,任一不一致即非零退出。
//
// 为什么有它(根因):光照 HTML 样张猜代码 + 肉眼验收 → 反复出「结构没对齐 / 隐藏覆盖(twMerge 吞字号、
// Mantine 吃 radius)」这类一眼不一致。改成「规范精确值 → computed style 自动核对」后,这类问题每次都被堵住。
// 规范:docs/design/2026-06-06-reference-v4-implementation-spec.md。改任何参考区设计后必须跑这条绿。
//
// 用法:pnpm run build && node tests/ux/design-fidelity.e2e.mjs
import { _electron as electron } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let passed = 0;
const fails = [];
function assert(cond, label, detail) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { fails.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}
const px = (v) => `${Math.round(parseFloat(v))}px`;

const app = await electron.launch({ executablePath: require("electron"), args: ["."], cwd: repoRoot, env: { ...process.env } });
const win = await app.firstWindow();
await win.waitForLoadState("domcontentloaded");
await win.waitForTimeout(1500);

try {
  await win.locator('[role="button"]', { hasText: "示例：30 秒产品介绍" }).first().click();
  await win.waitForTimeout(2500);
  await win.getByRole("button", { name: "生成", exact: false }).first().click().catch(() => {});
  await win.waitForTimeout(1000);
  await win.getByRole("button", { name: "添加视频节点", exact: false }).first().click();
  await win.waitForTimeout(1500);
  const sel = win.locator('.generation-canvas-v2-node__composer select[aria-label="模型"]').last();
  await sel.selectOption({ label: "Seedance 2.0" }).catch(() => sel.selectOption("bytedance/seedance-2"));
  await win.waitForTimeout(700);
  await win.locator('.generation-canvas-v2-node__composer [role="group"][aria-label="生成方式"] button', { hasText: "全能参考" }).first().click();
  await win.waitForTimeout(700);

  const m = await win.evaluate(() => {
    const comp = document.querySelector(".generation-canvas-v2-node__composer");
    const card = document.querySelector(".generation-canvas-v2-node__composer-card");
    const cs = (el) => el ? getComputedStyle(el) : null;
    const rectH = (el) => el ? Math.round(el.getBoundingClientRect().height) : -1;
    const seg = comp.querySelector('[role="group"][aria-label="生成方式"]');
    const segBtn = seg?.querySelector("button");
    const segLabel = comp.querySelector("span"); // 生成方式 label = 第一个 span
    const addTile = comp.querySelector('button[aria-label="加参考"]');
    const prompt = comp.querySelector(".generation-canvas-v2-node__prompt-input");
    const send = comp.querySelector('button[aria-label="生成素材"],button[aria-label="重新生成"]');
    const paramsRow = comp.querySelector('.generation-canvas-v2-node__params--parameters');
    const modelSel = comp.querySelector('select[aria-label="模型"]');
    const badge = Array.from(comp.querySelectorAll("span")).find((s) => s.textContent.trim() === "模板");
    const dividerEl = Array.from(card?.children || []).find((c) => (c.getAttribute("class") || "").includes("line-soft") && Math.round(c.getBoundingClientRect().height) <= 1);
    const g = (el, p) => el ? cs(el)[p] : "?";
    return {
      segBtnFont: g(segBtn, "fontSize"),
      labelFont: g(segLabel, "fontSize"),
      labelText: segLabel?.textContent?.trim(),
      addW: addTile ? Math.round(addTile.getBoundingClientRect().width) : -1,
      addH: addTile ? Math.round(addTile.getBoundingClientRect().height) : -1,
      addRadius: g(addTile, "borderTopLeftRadius"),
      addBorderStyle: g(addTile, "borderTopStyle"),
      promptFont: g(prompt, "fontSize"),
      promptLH: g(prompt, "lineHeight"),
      cardPad: g(card, "paddingTop"),
      cardGap: g(card, "rowGap"),
      cardBorder: g(card, "borderTopColor"),
      cardShadow: g(card, "boxShadow"),
      sendRadius: g(send, "borderTopLeftRadius"),
      // v3：参数横排内联（取代旧的设置弹层）——统计底栏项数 + 行数（同 top = 一行），验证拉宽不换行、全可见。
      paramItems: paramsRow ? paramsRow.children.length : 0,
      paramRows: paramsRow ? new Set(Array.from(paramsRow.children).map((c) => Math.round(c.getBoundingClientRect().top))).size : 0,
      // 结构:模板徽标是否与 model select 同一个父(嵌在模型芯片内,而非独立夹在中间)
      badgeInModelChip: Boolean(badge && modelSel && badge.parentElement === modelSel.parentElement),
      dividerPresent: Boolean(dividerEl),
    };
  });

  console.log("\n── 模式条 / 标签(规范 §1 字号 13/11) ──");
  assert(px(m.segBtnFont) === "13px", "模式条按钮 13px", m.segBtnFont);
  assert(px(m.labelFont) === "11px" && m.labelText === "生成方式", "生成方式 label 11px", `${m.labelText}/${m.labelFont}`);

  console.log("\n── 参考块(规范 §1/§2:56px / 6px / 虚线) ──");
  assert(m.addW === 56 && m.addH === 56, "加参考 tile 56×56", `${m.addW}×${m.addH}`);
  assert(px(m.addRadius) === "6px", "tile 圆角 6px", m.addRadius);
  assert(m.addBorderStyle === "dashed", "空态 tile 虚线边", m.addBorderStyle);

  console.log("\n── 描述框(规范 §1:13px / 行高 1.7) ──");
  assert(px(m.promptFont) === "13px", "prompt 13px", m.promptFont);
  assert(Math.abs(parseFloat(m.promptLH) - 22.1) < 1.5, "prompt 行高 ~1.7(22px)", m.promptLH);

  console.log("\n── composer 卡(规范:padding12 / gap11 / border-line / 非 lg 阴影) ──");
  assert(px(m.cardPad) === "12px", "卡 padding 12px", m.cardPad);
  assert(px(m.cardGap) === "11px", "卡 gap 11px", m.cardGap);
  assert(m.cardBorder.includes("0.91"), "卡边框 = nomi-line(0.91)", m.cardBorder);

  console.log("\n── 分隔线 / 底栏结构(用户点名问题) ──");
  assert(m.dividerPresent, "参考区与描述之间有分隔线(h-px)", "MISSING");
  assert(m.badgeInModelChip, "模板徽标嵌在模型芯片内(非独立夹在中间)", `badgeInModelChip=${m.badgeInModelChip}`);
  assert(px(m.sendRadius) === "9999px" || parseFloat(m.sendRadius) >= 999, "send 按钮圆形(pill)", m.sendRadius);
  assert(m.paramItems >= 1, "参数横排内联（模型芯片 + 标量参数 pill）", `paramItems=${m.paramItems}`);
  assert(m.paramRows === 1, "参数全在一行（拉宽不换行，不再藏进设置弹层）", `paramRows=${m.paramRows}`);

  // ── 捷径 A：拖文件到卡 → 加为参考（规范 §4 拖悬停态 + 落地写入数组）──
  // 合成 dragover（types 含 'Files'）→ 卡虚线 outline + 覆盖层「松手添加」；几何核对覆盖层覆盖卡面且在视口内。
  const d = await win.evaluate(async () => {
    const anchor = document.querySelector(".generation-canvas-v2-node__composer");
    const card = document.querySelector(".generation-canvas-v2-node__composer-card");
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([1])], "drop.png", { type: "image/png" }));
    anchor.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 140));
    const overlay = document.querySelector(".generation-canvas-v2-node__composer-dropzone");
    const cs = card ? getComputedStyle(card) : null;
    const orect = overlay ? overlay.getBoundingClientRect() : null;
    const crect = card ? card.getBoundingClientRect() : null;
    return {
      overlayPresent: Boolean(overlay),
      overlayText: overlay ? overlay.textContent.trim() : "",
      cardOutlineStyle: cs ? cs.outlineStyle : "?",
      coversCard: orect && crect ? (orect.width >= crect.width - 2 && orect.height >= crect.height - 2) : false,
      inViewport: orect ? (orect.top >= -1 && orect.bottom <= window.innerHeight + 1 && orect.left >= -1 && orect.right <= window.innerWidth + 1) : false,
    };
  });
  console.log("\n── 拖悬停态(规范 §4:dashed outline + 覆盖层「松手添加」+ 不溢出) ──");
  assert(d.overlayPresent && d.overlayText.includes("松手添加"), "拖悬停出现「松手添加」覆盖层", `${d.overlayPresent}/${d.overlayText}`);
  assert(d.cardOutlineStyle === "dashed", "拖悬停卡虚线 outline", d.cardOutlineStyle);
  assert(d.coversCard, "覆盖层覆盖整张卡面(几何)", `coversCard=${d.coversCard}`);
  assert(d.inViewport, "覆盖层不溢出视口(不被裁)", `inViewport=${d.inViewport}`);

  // 合成 drop（项目文件树 payload，nomi-local，无需上传）→ 参考区出现 tile + 覆盖层消失。
  const dropRes = await win.evaluate(async () => {
    const anchor = document.querySelector(".generation-canvas-v2-node__composer");
    const before = anchor.querySelectorAll('button[aria-label^="移除"]').length;
    const dt = new DataTransfer();
    dt.setData("application/x-nomi-workspace-file", JSON.stringify({ projectId: "p", relativePath: "a/b.png", name: "b.png", kind: "image" }));
    anchor.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 220));
    return {
      before,
      after: anchor.querySelectorAll('button[aria-label^="移除"]').length,
      overlayGone: !document.querySelector(".generation-canvas-v2-node__composer-dropzone"),
    };
  });
  console.log("\n── 拖入落地(捷径 A:写入数组参考 + 收起覆盖层) ──");
  assert(dropRes.after === dropRes.before + 1, "拖入后参考区多出 1 个 tile", `${dropRes.before}→${dropRes.after}`);
  assert(dropRes.overlayGone, "松手后覆盖层消失", `overlayGone=${dropRes.overlayGone}`);

  // 打开 picker 量规范 §5
  await win.locator('.generation-canvas-v2-node__composer button[aria-label="加参考"]').first().click();
  await win.waitForTimeout(500);
  const p = await win.evaluate(() => {
    const comp = document.querySelector(".generation-canvas-v2-node__composer");
    const picker = document.querySelector('[data-testid="asset-picker"]'); // 渲染在 body(逃出 composer 裁剪)
    const cs = (el) => el ? getComputedStyle(el) : null;
    const search = picker?.querySelector('input[aria-label="搜索素材名"]')?.closest("label") || picker?.querySelector('input[aria-label="搜索素材名"]')?.parentElement;
    const item = picker?.querySelector('button[aria-label]');
    const upload = Array.from(picker?.querySelectorAll("label") || []).find((l) => /上传本地文件/.test(l.textContent));
    const pr = picker ? picker.getBoundingClientRect() : null;
    return {
      pickerW: pr ? Math.round(pr.width) : -1,
      pickerRadius: picker ? cs(picker).borderTopLeftRadius : "?",
      pickerPad: picker ? cs(picker).paddingTop : "?",
      pickerShadow: picker ? cs(picker).boxShadow : "?",
      searchH: search ? Math.round(search.getBoundingClientRect().height) : -1,
      itemW: item ? Math.round(item.getBoundingClientRect().width) : -1,
      uploadH: upload ? Math.round(upload.getBoundingClientRect().height) : -1,
      // 遮挡回归:picker 是否完整在视口内(不被裁)。
      fullyVisible: pr ? (pr.top >= -1 && pr.bottom <= window.innerHeight + 1 && pr.left >= -1 && pr.right <= window.innerWidth + 1) : false,
      uploadVisible: upload ? (upload.getBoundingClientRect().bottom <= window.innerHeight + 1) : false,
    };
  });
  console.log("\n── 选择器(规范 §5:300宽 / 10圆角 / 48项 / 30搜索 / 34上传) ──");
  assert(p.pickerW === 300, "picker 宽 300", String(p.pickerW));
  assert(px(p.pickerRadius) === "10px", "picker 圆角 10px", p.pickerRadius);
  assert(px(p.pickerPad) === "10px", "picker padding 10px", p.pickerPad);
  assert(p.searchH === 30, "搜索框高 30", String(p.searchH));
  assert(p.itemW === 48, "picker tile 48", String(p.itemW));
  assert(p.uploadH === 34, "上传按钮高 34", String(p.uploadH));

  console.log("\n── 遮挡回归(规范 §5:picker 绝不被裁、上传按钮可见) ──");
  assert(p.fullyVisible, "picker 完整在视口内(未被 composer overflow 裁剪)", `fullyVisible=${p.fullyVisible}`);
  assert(p.uploadVisible, "「上传本地文件」按钮可见(不被裁到视口外)", `uploadVisible=${p.uploadVisible}`);

  console.log(`\n设计保真：${passed} 通过，${fails.length} 不一致`);
  if (fails.length) { console.error("不一致清单:\n - " + fails.join("\n - ")); process.exitCode = 1; }
  else console.log("✅ 全部对齐 v4 规范");
} catch (error) {
  console.error(`\nERROR: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
}
