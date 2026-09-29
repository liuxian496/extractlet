/**
 * 与运行环境无关的纯逻辑，不依赖任何 node:* 模块

/** PDF 中单页的文本 */
interface PageText {
  num: number;
  text: string;
}

/** 命令行参数解析结果 */
type CliCommand =
  | { action: 'help' }
  | { action: 'error'; message: string }
  | {
      action: 'run';
      pdfPath: string;
      pagesInput: string | undefined;
      outDir: string | undefined;
    };

/**
 * 返回命令行使用说明文本。
 */
export function getUsage(): string {
  return [
    'Usage:',
    '  extractlet --pdf "path/to/file.pdf" --pages 22-37',
    '  extractlet --pdf "path/to/file.pdf" --pages 5,10,15',
    '  extractlet --pdf "path/to/file.pdf" --pages 1-5,10,20-25',
    '  extractlet --pdf "path/to/file.pdf" --out "path/to/dir"',
    '  extractlet --pdf "path/to/file.pdf"             # extract all pages',
    '',
    'Options:',
    '  -p, --pdf <path>     PDF file path (required)',
    '  -r, --pages <range>  Page range to extract (default: all)',
    '  -o, --out <dir>      Output directory (default: ./output)',
    '  -h, --help           Show help',
  ].join('\n');
}

/**
 * 解析命令行参数，不做文件校验，也不退出进程。
 *
 * @param args - 命令行参数（不含 node 与脚本路径
 * @returns 解析结果
 */
export function parseCliArgs(args: string[]): CliCommand {
  let pdfPath: string | undefined;
  let pagesInput: string | undefined;
  let outDir: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--pdf' || arg === '-p') {
      pdfPath = args[index + 1];
      index++;
    } else if (arg === '--pages' || arg === '-r') {
      pagesInput = args[index + 1];
      index++;
    } else if (arg === '--out' || arg === '-o') {
      outDir = args[index + 1];
      index++;
    } else if (arg === '--help' || arg === '-h') {
      return { action: 'help' };
    }
  }

  if (!pdfPath) {
    return { action: 'error', message: 'Error: --pdf is required.' };
  }

  return { action: 'run', pdfPath, pagesInput, outDir };
}

/**
 * 将用户输入的页码范围字符串解析为有序的页码数组
 *
 * 支持格式
 *   - "1-5"     连续范围
 *   - "5,10,15" 单页列表
 *   - "1-5,10"  混合形式
 *   - undefined 表示提取所有页面
 *
 * @param input - 用户输入的页码范围字符串
 * @param totalPages - PDF 文件的总页数
 * @returns 去重并升序排列的页码数组
 * @throws {TypeError} 当范围格式无效时抛出
 */
export function parsePageRanges(
  input: string | undefined,
  totalPages: number
): number[] {
  // 未指定页码时，默认提取全部页面
  if (!input || input.trim().length === 0) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  // 使用 Set 去重，再排序
  const pages = new Set<number>();

  for (const part of input.split(',')) {
    const trimmed = part.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);
    if (!match) {
      throw new TypeError(`Invalid page range: ${trimmed}`);
    }
    const start = Number.parseInt(match[1], 10);
    const end = match[2] === undefined ? start : Number.parseInt(match[2], 10);
    if (start > end) {
      throw new TypeError(`Invalid page range: ${trimmed}`);
    }
    for (let page = start; page <= end; page++) {
      pages.add(page);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * 找出超出totalPages 范围的页码
 *
 * @param pages - 页码数组
 * @param totalPages - PDF 文件的总页数
 * @returns 越界的页码
 */
export function findInvalidPages(
  pages: number[],
  totalPages: number
): number[] {
  return pages.filter(page => page < 1 || page > totalPages);
}

/**
 * 将有序的页码数组压缩为人类可读的连续范围字符串
 *
 * 例如 / Example:
 *   [1, 2, 3, 5, 7, 8] → "1-3,5,7-8"
 *
 * @param pages - 已排序的页码数组
 * @returns 压缩后的页码范围字符串
 */
export function buildRangeText(pages: number[]): string {
  if (pages.length === 0) {
    return 'empty';
  }

  // 追踪连续页码段的起止位置
  const ranges: string[] = [];
  let start = pages[0];
  let end = pages[0];

  for (let index = 1; index < pages.length; index++) {
    if (pages[index] === end + 1) {
      end = pages[index];
    } else {
      ranges.push(start === end ? String(start) : `${start}-${end}`);
      start = pages[index];
      end = pages[index];
    }
  }

  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(',');
}

/**
 * 根据 PDF 文件名和页码范围生成输出文件名，同时兼容 / 与 \ 分隔符
 *
 * @param pdfPath - PDF 文件路径
 * @param pages - 选定的页码数组
 * @returns 输出文件名（含 .txt 扩展名）
 */
export function getOutputFileName(pdfPath: string, pages: number[]): string {
  const fileName = pdfPath.slice(
    Math.max(pdfPath.lastIndexOf('/'), pdfPath.lastIndexOf('\\')) + 1
  );
  const dotIndex = fileName.lastIndexOf('.');
  // 与 path.extname 一致：以点开头的文件名（如 .hidden）视为无扩展名
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName}_${buildRangeText(pages)}.txt`;
}

/**
 * 按页拼接文本，并过滤掉未请求的页
 *
 * @param pageTexts - 解析得到的页面文本
 * @param pages - 请求的页码数组
 * @returns 合并后的文本内容，包含页码分隔标记
 */
export function formatPages(pageTexts: PageText[], pages: number[]): string {
  let output = '';
  for (const page of pageTexts) {
    if (!pages.includes(page.num)) {
      continue;
    }
    output += `\n\n===== PAGE ${page.num} =====\n\n`;
    output += page.text;
  }
  return output;
}
