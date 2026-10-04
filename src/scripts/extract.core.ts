/**
 * 与运行环境无关的纯逻辑，不依赖任何 node:* 模块
 */

import type {
  LogKind,
  Logger,
  LogLevel,
  PageText,
} from './extract.core.types.ts';

/** 命令行参数解析结果 */
type CliCommand =
  | { action: 'help' }
  | { action: 'error'; message: string }
  | {
    action: 'run';
    pdfPath: string;
    pagesInput: string | undefined;
    outDir: string | undefined;
    force: boolean;
    logLevel: LogLevel;
  };

/** 输出文件名的长度上限，为文件系统 255 字符限制预留余量 */
const MAX_FILE_NAME_LENGTH = 200;

/** 需要取值的选项与解析结果字段的对应关系 */
const VALUE_OPTIONS = new Map<string, 'pdfPath' | 'pagesInput' | 'outDir'>([
  ['--pdf', 'pdfPath'],
  ['-p', 'pdfPath'],
  ['--pages', 'pagesInput'],
  ['-r', 'pagesInput'],
  ['--out', 'outDir'],
  ['-o', 'outDir'],
]);

/** 不取值的开关选项与解析结果字段的对应关系 */
const FLAG_OPTIONS = new Map<string, 'force' | 'quiet' | 'verbose'>([
  ['--force', 'force'],
  ['-f', 'force'],
  ['--quiet', 'quiet'],
  ['-q', 'quiet'],
  ['--verbose', 'verbose'],
  ['-v', 'verbose'],
]);

/**
 * 面向用户的命令行错误，入口只输出 message 而不打印堆栈
 */
export class CliError extends Error {
  /** 是否在错误信息后附带用法说明 */
  readonly showUsage: boolean;

  constructor(message: string, showUsage = false) {
    super(message);
    this.name = 'CliError';
    this.showUsage = showUsage;
  }
}

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
    '  extractlet --pdf "path/to/file.pdf" --out -     # write to stdout',
    '  extractlet --pdf "path/to/file.pdf"             # extract all pages',
    '',
    'Options:',
    '  -p, --pdf <path>     PDF file path (required)',
    '  -r, --pages <range>  Page range to extract (default: all)',
    '  -o, --out <dir>      Output directory, or "-" for stdout (default: ./output)',
    '  -f, --force          Overwrite the output file if it exists',
    '  -q, --quiet          Suppress status messages (warnings are kept)',
    '  -v, --verbose        Show options, timings and per-page character counts',
    '  -h, --help           Show help',
  ].join('\n');
}

/**
 * 解析命令行参数，不做文件校验，也不退出进程。
 *
 * 长选项支持 `--name value` 与 `--name=value` 两种写法；
 * 未知选项、多余的位置参数或缺少取值都会返回错误。
 *
 * @param args - 命令行参数（不含 node 与脚本路径）
 * @returns 解析结果
 */
export function parseCliArgs(args: string[]): CliCommand {
  if (args.some(arg => arg === '--help' || arg === '-h')) {
    return { action: 'help' };
  }

  const values: Partial<Record<'pdfPath' | 'pagesInput' | 'outDir', string>> =
    {};
  const flags = { force: false, quiet: false, verbose: false };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const eqIndex = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eqIndex === -1 ? arg : arg.slice(0, eqIndex);

    const flag = FLAG_OPTIONS.get(name);
    if (flag !== undefined) {
      if (eqIndex !== -1) {
        return {
          action: 'error',
          message: `Error: ${name} does not take a value.`,
        };
      }
      flags[flag] = true;
      continue;
    }

    const key = VALUE_OPTIONS.get(name);
    if (key === undefined) {
      return {
        action: 'error',
        message: arg.startsWith('-')
          ? `Error: Unknown option: ${name}`
          : `Error: Unexpected argument: ${arg}`,
      };
    }

    const value = eqIndex === -1 ? args[++index] : arg.slice(eqIndex + 1);
    // 分开书写时，以 - 开头的下一项视为漏填取值后的另一个选项（单独的 - 表示 stdout）
    const isNextOption =
      eqIndex === -1 && value?.startsWith('-') && value !== '-';
    if (!value || isNextOption) {
      return { action: 'error', message: `Error: ${name} requires a value.` };
    }
    values[key] = value;
  }

  if (!values.pdfPath) {
    return { action: 'error', message: 'Error: --pdf is required.' };
  }

  if (flags.quiet && flags.verbose) {
    return {
      action: 'error',
      message: 'Error: --quiet and --verbose cannot be used together.',
    };
  }

  return {
    action: 'run',
    pdfPath: values.pdfPath,
    pagesInput: values.pagesInput,
    outDir: values.outDir,
    force: flags.force,
    logLevel: flags.quiet ? 'quiet' : flags.verbose ? 'verbose' : 'normal',
  };
}

/**
 * 按日志级别过滤后交给 write 输出：warn 始终输出，info 在 quiet 时静默，debug 仅在 verbose 时输出
 *
 * @param level - 日志级别
 * @param write - 实际输出函数，由调用方决定写到哪里、是否上色
 */
export function createLogger(
  level: LogLevel,
  write: (kind: LogKind, message: string) => void
): Logger {
  const emit = (kind: LogKind, enabled: boolean) => (message: string) => {
    if (enabled) {
      write(kind, message);
    }
  };
  return {
    info: emit('info', level !== 'quiet'),
    warn: emit('warn', true),
    debug: emit('debug', level === 'verbose'),
  };
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
 * @throws {RangeError} 当存在超出 1..totalPages 的范围时抛出，列出所有越界段
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
  const outOfRange: string[] = [];

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
    // 先校验边界再展开，避免 1-999999999 这类输入耗尽内存
    if (start < 1 || end > totalPages) {
      outOfRange.push(start === end ? String(start) : `${start}-${end}`);
      continue;
    }
    for (let page = start; page <= end; page++) {
      pages.add(page);
    }
  }

  if (outOfRange.length > 0) {
    throw new RangeError(
      `Pages out of range (1-${totalPages}): ${outOfRange.join(', ')}`
    );
  }

  return Array.from(pages).sort((a, b) => a - b);
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
 * 文件名超过长度上限时，改用 `{名称}_{首页}-{末页}_{页数}pages.txt`
 *
 * @param pdfPath - PDF 文件路径
 * @param pages - 已排序的页码数组
 * @returns 输出文件名（含 .txt 扩展名）
 */
export function getOutputFileName(pdfPath: string, pages: number[]): string {
  const fileName = pdfPath.slice(
    Math.max(pdfPath.lastIndexOf('/'), pdfPath.lastIndexOf('\\')) + 1
  );
  const dotIndex = fileName.lastIndexOf('.');
  // 与 path.extname 一致：以点开头的文件名（如 .hidden）视为无扩展名
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const fullName = `${baseName}_${buildRangeText(pages)}.txt`;
  if (fullName.length <= MAX_FILE_NAME_LENGTH) {
    return fullName;
  }
  return `${baseName}_${pages[0]}-${pages[pages.length - 1]}_${pages.length}pages.txt`;
}

/**
 * 按 pages 的顺序拼接页面文本
 *
 * 不校验缺页：pageTexts 中不存在的页码会被跳过，缺页检查由 inspectPages 负责
 *
 * @param pageTexts - 解析得到的页面文本
 * @param pages - 请求的页码数组，决定输出顺序
 * @returns 合并后的文本内容，包含页码分隔标记；无匹配页（含 pages 为空）时返回空字符串
 */
export function formatPages(pageTexts: PageText[], pages: number[]): string {
  const textByPage = new Map(pageTexts.map(page => [page.num, page.text]));
  return pages
    .filter(num => textByPage.has(num))
    .map(num => `===== PAGE ${num} =====\n\n${textByPage.get(num)}`)
    .join('\n\n');
}

/**
 * 检查解析结果中缺失或没有文本的页
 *
 * @param pageTexts - 解析得到的页面文本
 * @param pages - 请求的页码数组
 * @returns missing 为解析器未返回的页，empty 为仅含空白字符的页
 */
export function inspectPages(
  pageTexts: PageText[],
  pages: number[]
): { missing: number[]; empty: number[] } {
  const textByPage = new Map(pageTexts.map(page => [page.num, page.text]));
  const missing: number[] = [];
  const empty: number[] = [];
  for (const num of pages) {
    const text = textByPage.get(num);
    if (text === undefined) {
      missing.push(num);
    } else if (text.trim().length === 0) {
      empty.push(num);
    }
  }
  return { missing, empty };
}
