# PDF 提取命令行工具

一个轻量级命令行工具，用于按指定页码范围从 PDF 文件中提取文本。

## 安装

需要 Node.js >= 20.11。

### 全局安装

```bash
npm install -g extractlet
extractlet --pdf "path/to/file.pdf" --pages 22-37
```

### 使用 npx 临时执行

```bash
npx extractlet --pdf "path/to/file.pdf" --pages 22-37
```

## 使用方式

以下示例以全局安装为例，使用 npx 时将 `extractlet` 替换为 `npx extractlet` 即可。

### 提取连续页码范围

```bash
extractlet --pdf "path/to/file.pdf" --pages 22-37
```

### 提取指定页码

```bash
extractlet --pdf "path/to/file.pdf" --pages 5,10,15
```

### 提取混合页码范围

```bash
extractlet --pdf "path/to/file.pdf" --pages 1-5,10,20-25
```

### 提取全部页码

```bash
extractlet --pdf "path/to/file.pdf"
```

### 指定输出目录

```bash
extractlet --pdf "path/to/file.pdf" --pages 1-5 --out "path/to/dir"
```

## 输出

提取出的文本文件默认保存到当前工作目录下的 `output/` 目录（可通过 `--out` 指定），文件名为 `{pdf文件名}_{页码范围}.txt`。

## 参数说明

| 参数              | 别名 | 说明                               |
|-------------------|------|------------------------------------|
| `--pdf <path>`    | `-p` | PDF 文件路径（必填）               |
| `--pages <range>` | `-r` | 要提取的页码范围（可选，默认全部） |
| `--out <dir>`     | `-o` | 输出目录（可选，默认 `./output`）  |
| `--help`          | `-h` | 显示帮助信息                       |

## 本地开发

```bash
npm install
npm run build
node dist/extract.js --pdf "path/to/file.pdf" --pages 1-5
```

`npm run build` 仅打包 `src/scripts/extract.ts`，产物为 `dist/extract.js`。

本地联调全局命令：

```bash
npm link
extractlet -h
```

## 发布

```bash
npm login
npm publish --dry-run   # 检查将要发布的文件
npm publish
```

`prepublishOnly` 会在发布前自动执行 `npm run build`，发布内容仅包含 `dist/`、`package.json` 与 `README.md`。
