# FIM Logo 设计方案：The Braces & The Brick

> FIM 的品牌标识方案。一對粗壮的几何花括号 `{ }`，正中间嵌一块实心方砖。
> 设计立场：摆脱原 twinny 时代"对视卡通眼睛"的可爱气质，走克制、匠气、有重量感的路线，对标苹果 logo 与 Anthropic 标志的"纯粹符号 + 叙事内核"。

## 概念

```
   {            ■            }

  你写的骨架      FIM 填的 middle
```

一對粗壮、单一粗细的几何花括号 `{ }`，正中间嵌一块实心方砖。花括号是你写下的代码骨架（prefix / suffix 的边界），中间那块砖是 FIM 填进去的 middle。

## 为什么是花括号

`{ }` 是**代码块的界定符**——函数体、类、对象、控制流，所有语言的开发者敲下 `{` 时都知道"这里要写一段实现"。FIM 补全最高频的场景正是光标停在 `{` 之后、补出整个函数体（见 `docs/PD.md` 的 `block_completion` 意图）。所以"花括号之间填内容"是 FIM 最真实的动作图示，不是隐喻、是直陈。

比 `[ ]`（数组/索引）更"代码结构"、更普世；花括号的曲线也比直角方括号更有姿态、更有 logo 辨识度。

## 叙事内核

你敲下 `{`，光标停住，留白等待——FIM 填的就是这段等待中的 middle。两端是你的设计，中间是它的实现。

与苹果的"咬一口 = byte"、Anthropic 的"放射花 = 思想辐射"同构：**一个日常物 + 一个叙事动作 = 不可错认的纯粹符号**。区别在于 FIM 的日常物是开发者每天都敲的 `{ }`，叙事动作是"把空块填满"——目标用户一眼会心，无需解释。

## 配色

| 角色 | 色值 | 用途 |
|---|---|---|
| Charcoal 主色 | `#171A21` | 花括号、wordmark |
| Amber 强调 | `#E8A33D` | 中间的砖 |
| Moonstone 反色 | `#E6E8EB` | 暗色背景上的括号 / 文字 |

深炭墨给重量和专业感；琥珀让"被填入的 middle"像光标亮起的一瞬，也给冷代码一点本地手作的温度——区别于 Anthropic 的赤陶，避开 AI 默认的蓝紫渐变与 acid-green。

## Wordmark

符号旁锁定 `FIM`，mono 字体：**Berkeley Mono**（付费，气质最佳）或 **IBM Plex Mono**（免费替代），中粗 500，全大写，字距 `+0.06em`。mono 让 "FIM" 读起来像代码标识，强化"给开发者的工具"，避开 Inter / Geist 那套默认无衬线。

## 场景变体

| 变体 | 构成 | 用途 |
|---|---|---|
| 主符号（彩色） | 深炭墨花括号 + 琥珀砖 | 市场图标、README hero、官网 favicon 彩色版 |
| 单色剪影 | 全 `currentColor`；砖用圆角或描边与括号区分 | VS Code 活动栏（monochrome）、文档页脚、印刷 |
| 锁定标 | 符号 + `FIM` mono | README 顶、官网导航、市场 banner |
| favicon | 仅符号，像素级简化 | 浏览器标签 |
| hero 大图 | 符号放大 + slogan 排版 | 官网首屏 |

## 几何规范（给设计师 / AI）

- 方形画布，居中，四周 padding ≈ 画布 20%。
- 左右花括号各占宽约 20%，中间砖区约 60%。
- 砖为**微圆角正方形**（圆角半径 ≈ 边长 15%），垂直居中，宽度约为单个花括号的 1.2–1.5 倍。
- 花括号笔画粗细 ≈ 砖边长的 20%（粗壮，有重量，不是细衬线花括号）。
- 砖与花括号内侧留缝 ≈ 笔画粗细的 1 倍（呼吸感，别顶死）。
- 单色版：花括号实心 `currentColor`，砖用圆角实心或描边与括号区分，保证 16×16 可辨。

## 生图 prompt（复制即用）

**英文（Midjourney / DALL·E / Ideogram 效果更好）：**

```
Minimalist app icon for a developer tool called FIM (Fill-in-the-Middle, an
inline code-completion extension). A pair of bold, single-weight geometric
curly braces { } with a single solid square block nested in the exact center
— symbolizing "the function body being filled in between the braces". Braces
in dark charcoal (#171A21), center block in warm amber (#E8A33D), on off-white
background. Flat vector, no gradients, no glow, no drop shadow, no text. The
braces are bold and geometric (not thin serifs); the center block is a slightly
rounded square, centered with a small even breathing gap inside the braces.
Restraint of the Apple logo and Anthropic's mark — a pure symbol with a
narrative core, still readable as a one-color silhouette at 16x16. Square
canvas, centered, generous padding. --no text, letters, gradient, 3d
```

**中文（喂国内生图工具）：**

```
极简应用图标，开发者工具 FIM（Fill-in-the-Middle，VS Code 行内代码补全）。
一對粗壮、单一描边粗细的几何花括号 { }，正中间嵌一个实心方块——象征"被
填入花括号之间的函数体"。花括号深炭墨色 #171A21，中间方块暖琥珀色
#E8A33D，米白背景。扁平矢量，无渐变，无发光，无投影，无文字。花括号是粗
壮几何形（不是细衬线体），中间方块为微圆角正方形，居中，与花括号内壁四周
留均匀小缝。参考苹果 logo 与 Anthropic 标志的克制感：一个有叙事内核的纯粹
符号，缩到 16×16 单色剪影仍清晰可辨。方形画布居中，留充足边距。不要文字、
字母、渐变、3D。
```

## 注意

生图 AI 的通病是塞字母、加渐变 / 发光 / 3D。prompt 里已反复用 `no text / no gradient / no glow` 压制。若仍跑偏，让设计师按上方"几何规范"手绘矢量最稳——这个符号足够简单，手绘成本很低。
