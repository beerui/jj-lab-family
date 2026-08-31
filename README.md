# jj-lab-family（Family gym）

jj-flow **实验场 Lab 2**：一个实验项目，包装两个同源已分叉的业务仓（`notes-alpha` / `notes-beta`）加非 git control。练习 `same` ADAPT 与 `dispatch` VERIFIED。

这不是生产项目族角色，**不要**命名为 项目B / 项目C / `handoff`。

| 字段 | 值 |
| --- | --- |
| lab id | `family-gym` |
| 推荐仓名 | `jj-lab-family`（与 `jj-flow` 同级） |
| 业务 sibling | `notes-alpha`（源）、`notes-beta`（目标） |
| 协议设计 | [jj-flow-labs](https://github.com/beerui/jj-flow/blob/main/docs/design-docs/jj-flow-labs.md) |
| 发现根 | 环境变量 `JJ_LAB_FAMILY_ROOT` = **本仓绝对路径** |

PR2 只含仓骨架。种子、control-template、`scripts/lab.mjs` 见后续 PR5。

`_materialized/` 已被 ignore。本仓根 **不是** 业务 git toplevel；包装目录 `_materialized/family-gym/` 也不是。ralph cwd = `…/notes-alpha`，same cwd = `…/notes-beta`。

```powershell
$env:JJ_LAB_FAMILY_ROOT = "D:\daji-docs\jj-lab-family"
```
