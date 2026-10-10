# PDF 提取命令行工具
![GitHub](https://img.shields.io/github/license/liuxian496/extractlet)
![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/liuxian496/extractlet/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/liuxian496/extractlet/badge.svg?branch=main)](https://coveralls.io/github/liuxian496/extractlet?branch=main)
![GitHub Repo stars](https://img.shields.io/github/stars/liuxian496/extractlet)

一个轻量级命令行工具，用于按指定页码范围从 PDF 文件中提取文本。

## 安装

需要 Node.js >= 20.12。

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

### 输出到标准输出

```bash
extractlet --pdf "path/to/file.pdf" --pages 1-5 --out - | more
```

此时正文写入 stdout，状态信息与警告写入 stderr。

### 覆盖已有的输出文件

```bash
extractlet --pdf "path/to/file.pdf" --pages 1-5 --force
```

### 控制输出详细程度

```bash
extractlet --pdf "path/to/file.pdf" --quiet     # 只输出警告与错误
extractlet --pdf "path/to/file.pdf" --verbose   # 额外输出选项、各阶段耗时与每页字符数
```

- `--quiet` 与 `--verbose` 不能同时使用；`--verbose` 的额外信息写入 stderr。
- 警告（黄色）与错误（红色）仅在终端支持颜色时上色，设置 `NO_COLOR=1` 可关闭。

## 输出

提取出的文本文件默认保存到当前工作目录下的 `output/` 目录（可通过 `--out` 指定），文件名为 `{pdf文件名}_{页码范围}.txt`。

- 文件名超过 200 个字符时，改为 `{pdf文件名}_{首页}-{末页}_{页数}pages.txt`。
- 输出文件已存在时默认报错，需加 `--force` 才会覆盖。
- 有页面没有提取到文本时会输出警告；扫描版 PDF（纯图片）需要 OCR，本工具不支持。
- 不支持加密 PDF。

## 参数说明

| 参数              | 别名 | 说明                                               |
|-------------------|------|----------------------------------------------------|
| `--pdf <path>`    | `-p` | PDF 文件路径（必填）                               |
| `--pages <range>` | `-r` | 要提取的页码范围（可选，默认全部）                 |
| `--out <dir>`     | `-o` | 输出目录，`-` 表示 stdout（可选，默认 `./output`） |
| `--force`         | `-f` | 覆盖已存在的输出文件                               |
| `--quiet`         | `-q` | 不输出状态信息，仅保留警告与错误                   |
| `--verbose`       | `-v` | 输出选项、各阶段耗时与每页字符数                   |
| `--help`          | `-h` | 显示帮助信息                                       |
| `--version`       | `-V` | 显示版本号                                         |

长参数也支持 `--pdf=path/to/file.pdf` 写法；未知参数或缺少取值时会报错。

## 本地开发

[仓库地址](https://github.com/liuxian496/extractlet/)

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

## 如果你想请我喝一咖啡（Buy Me a Coffee）

<img src=".\\public\\wechat.jpg" height="360">

<img src=".\\public\\alipay.jpg" height="360">