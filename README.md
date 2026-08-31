# jj-lab-family（Family gym）

jj-flow **实验场 Lab 2**：一个实验项目，包装 `notes-alpha`（Vuex 形）/ `notes-beta`（Pinia 形）加非 git control。

不要命名为 项目B / 项目C / `handoff`。

```powershell
$env:JJ_LAB_FAMILY_ROOT = "D:\daji-docs\jj-lab-family"
$env:JJ_FLOW_ROOT = "D:\daji-docs\jj-flow"
node scripts/lab.mjs seed
node scripts/lab.mjs oracle --suite mechanical --json
```

| 动作 | cwd |
| --- | --- |
| ralph / handoff | `_materialized/family-gym/notes-alpha`（`dev`） |
| same | `_materialized/family-gym/notes-beta`（`dev`） |
| dispatch tick | `notes-alpha`（默认） |
| 禁止 | 包装目录、`control/`、本种子仓根、产品仓根 |
