# 调试指南

本文档说明如何在 VS Code 中调试 extractlet 的 CLI 入口。

## 1. 调试入口

调用链：

```
src/scripts/extract.ts          # CLI 入口，调用 main(process.argv.slice(2))
  └─ src/scripts/extract.lib.ts # main(args)：解析参数 → 读取 PDF → 提取文本 → 输出
```

### 为什么可以直接调试 TS 源码

- **Node 原生支持类型剥离**：Node ≥ 23.6 默认可直接运行 `.ts` 文件（本机为 v24），无需 `tsx` / `ts-node`，也无需先 `build`。
- **tsconfig 开启了 `erasableSyntaxOnly`**：源码中不含 `enum`、`namespace`、参数属性等 Node 无法剥离的语法。
- **import 均带 `.ts` 后缀**：Node 能直接解析模块路径。

类型剥离只会把类型替换为空白，行列号与源码完全一致，因此无需 sourcemap 即可准确命中断点。

## 2. 方式一：F5 调试（推荐）

配置文件位于 [.vscode/launch.json](../.vscode/launch.json)：

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug extract main",
      "program": "${workspaceFolder}/src/scripts/extract.ts",
      "args": [
        "--pdf",
        "${input:pdfPath}",
        "--pages",
        "${input:pages}",
        "--out",
        "-",
      ],
      "cwd": "${workspaceFolder}",
      "outFiles": [],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"],
    },
  ],
  "inputs": [
    {
      "id": "pdfPath",
      "type": "promptString",
      "description": "PDF 文件路径",
    },
    {
      "id": "pages",
      "type": "promptString",
      "description": "页码范围，如 1-3 或 5,10,15",
      "default": "1-3",
    },
  ],
}
```

### 字段说明

| 字段        | 说明                                                                                   |
|-------------|----------------------------------------------------------------------------------------|
| `program`   | 直接指向 TS 入口文件                                                                   |
| `args`      | 即 `main(process.argv.slice(2))` 收到的参数                                            |
| `inputs`    | 启动时弹出输入框，依次填写 PDF 路径与页码（默认 `1-3`）                                |
| `outFiles`  | 置为空数组，禁止调试器通过 sourcemap 把 `.ts` 替换为 `dist/` 下的编译产物（见第 5 节） |
| `console`   | 在集成终端中运行，便于查看 stdout / stderr                                             |
| `skipFiles` | 单步调试时跳过 Node 内部代码                                                           |

### 使用步骤

1. 在 [src/scripts/extract.lib.ts](../src/scripts/extract.lib.ts) 的 `main` 函数中打断点。
2. 按 F5，选择 **Debug extract main**。
3. 按提示输入 PDF 路径与页码。

### 输出方式

- `--out -`：提取结果输出到终端（stdout），状态信息走 stderr。
- 删除 `args` 中的 `"--out", "-"`：结果写入默认的 `output/` 目录。
- 如需覆盖已存在的输出文件，在 `args` 中追加 `"--force"`。

## 3. 方式二：JavaScript Debug Terminal

无需任何配置：

1. 打开命令面板（Ctrl+Shift+P 或 Cmd+Shift+P），输入 `Debug: Create JavaScript Debug Terminal` 并回车。或者，在终端视图的右上角，点击终端下拉菜单（+ 号旁边的箭头），选择 `JavaScript Debug Terminal`。
2. 在打开的终端中运行：

```powershell
node src/scripts/extract.ts --pdf "path/to/file.pdf" --pages 1-3 --out -
```

在该终端中启动的 Node 进程会自动附加调试器，断点直接生效。

### 不使用调试器时查看内部日志

源码中用 `util.debuglog('extractlet')` 记录原始参数与 pdf-parse 的原始异常，默认不输出，设置 `NODE_DEBUG` 后写入 stderr：

```powershell
$env:NODE_DEBUG = 'extractlet'
node src/scripts/extract.ts --pdf "path/to/file.pdf" --pages 1-3 --out -
Remove-Item Env:NODE_DEBUG
```

面向用户的耗时与每页字符数请使用 `--verbose`。

## 4. 方式三：调试编译产物

用于排查仅在打包后出现的问题。`vite.config.ts` 中已开启 `sourcemap: true`，断点可映射回 TS 源码。

> 调试前务必先执行 `npm run build`，确保 `dist/` 比源码新，否则行号对不上、断点无法命中（见第 5 节）。

### 做法 A：JavaScript Debug Terminal（最简单）

在 JavaScript Debug Terminal 中直接运行，调试器自动附加，无需 `--inspect-brk`：

```powershell
npm run build
node dist/extract.js --pdf "path/to/file.pdf" --pages 1-3
```

### 做法 B：`--inspect-brk` + 手动附加

1. 在普通终端中启动，进程会停在第一行等待调试器：

   ```powershell
   npm run build
   node --inspect-brk dist/extract.js --pdf "path/to/file.pdf" --pages 1-3
   ```

   终端输出：

   ```
   Debugger listening on ws://127.0.0.1:9229/...
   For help, see: https://nodejs.org/en/docs/inspector
   ```

2. 附加调试器，任选其一：
   - 命令面板执行 `Debug: Attach to Node Process`，选择 `dist/extract.js` 对应的进程；
   - 或在 `launch.json` 的 `configurations` 中新增 attach 配置，之后通过 F5 选择它：

     ```jsonc
     {
       "type": "node",
       "request": "attach",
       "name": "Attach to dist",
       "port": 9229,
       "skipFiles": ["<node_internals>/**"],
     }
     ```

3. 附加成功后程序停在第一行，按 F5 继续，即可命中 `extract.lib.ts` 中的断点。

> **注意**：若终端一直停在 `Debugger listening...` 不动，说明尚未附加调试器，这是 `--inspect-brk` 的正常行为，并非程序卡死。普通终端不会自动附加 VS Code 调试器。

## 5. 常见问题：断点不生效

### 现象

在 `extract.lib.ts` 的 `main` 中打了断点，按 F5 后程序正常运行结束，但没有在断点处停住。

### 排查

1. **查看调试终端实际执行的命令**。若出现的是：

   ```
   node '.\dist\extract.js' --pdf ...
   ```

   而不是 `.\src\scripts\extract.ts`，说明调试器运行的是编译产物。

2. **对比产物与源码的修改时间**：

   ```powershell
   Get-ChildItem dist | Select-Object Name, LastWriteTime
   Get-Item src/scripts/extract.lib.ts | Select-Object Name, LastWriteTime
   (Get-Content dist/extract.js.map -Raw | ConvertFrom-Json).sources
   ```

   若 `dist/extract.js` 早于源码，且 sourcemap 的 `sources` 指向 `../src/scripts/*.ts`，即可确认问题。

### 原因

VS Code 的 Node 调试器（js-debug）在 `program` 为 `.ts` 文件时，会按 `outFiles`（默认匹配工作区内所有 `*.js`）查找 sourcemap 指回该 `.ts` 的编译产物，并**改为运行该产物**。

本项目 `dist/extract.js.map` 恰好指回 `src/scripts/extract.ts`，于是实际运行的是 `dist/extract.js`。而源码修改后未重新 build，产物已过期，sourcemap 行号与当前源码对不上，断点因此无法绑定。

### 解决

在 `launch.json` 中设置 `"outFiles": []`，让调试器直接运行 TS 源码（Node 原生剥离类型）。修改源码后无需重新 build。
