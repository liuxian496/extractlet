import * as fs from 'node:fs';
import * as path from 'node:path';
import { debuglog, styleText } from 'node:util';
import { PDFParse } from 'pdf-parse';
import {
  buildRangeText,
  CliError,
  createLogger,
  formatPages,
  getOutputFileName,
  getUsage,
  inspectPages,
  parseCliArgs,
  parsePageRanges,
} from './extract.core.ts';
import type { ExtractOptions } from './extract.types.ts';
import type { Logger, PageText } from './extract.core.types.ts';

/** 面向开发者的内部日志，仅在 NODE_DEBUG=extractlet 时输出 */
const debug = debuglog('extractlet');

/**
 * 仅当 stderr 支持颜色时上色，hasColors 会遵循 NO_COLOR / FORCE_COLOR
 *
 * @param format - styleText 格式，如 'yellow'、'red'
 * @param text - 原始文本
 * @returns 上色后的文本；不支持颜色时原样返回
 */
export function paint(
  format: Parameters<typeof styleText>[0],
  text: string
): string {
  return process.stderr.hasColors?.()
    ? styleText(format, text, { validateStream: false })
    : text;
}

function elapsedSince(start: number): string {
  return `${Math.round(performance.now() - start)} ms`;
}

/**
 * 在控制台显示命令行使用说明
 */
export function showUsage(): void {
  console.log(getUsage());
}

/**
 * 在控制台显示版本号
 * @param version 版本号
 */
export function showVersion(version: string): void {
  console.log(`v${version}`)
}

/**
 * 解析命令行参数并校验 PDF 文件是否存在
 *
 * @param args - 命令行参数（不含 node 与脚本路径）
 * @returns 解析后的提取选项；指定 --help 时返回 null
 * @throws {CliError} 参数无效或文件不存在时抛出
 */
export function parseArguments(args: string[]): ExtractOptions | string | null {
  debug('args: %o', args);
  const command = parseCliArgs(args);
  if (command.action === 'help') {
    return null;
  }

  if (command.action === 'version') {
    return command.version
  }

  if (command.action === 'error') {
    throw new CliError(command.message, true);
  }

  const absolutePath = path.resolve(command.pdfPath);
  if (!fs.existsSync(absolutePath)) {
    throw new CliError(`Error: PDF file not found: ${absolutePath}`);
  }

  return {
    pdfPath: absolutePath,
    pagesInput: command.pagesInput,
    outDir:
      command.outDir === '-'
        ? undefined
        : path.resolve(command.outDir ?? 'output'),
    force: command.force,
    logLevel: command.logLevel,
  };
}

/**
 * 将 pdf-parse 抛出的已知异常转换为 CliError，其余原样返回
 */
function toCliError(error: unknown): unknown {
  debug('pdf-parse error: %o', error);
  const name = error instanceof Error ? error.name : undefined;
  if (name === 'PasswordException') {
    return new CliError(
      'Error: PDF is password-protected, which is not supported.'
    );
  }
  if (name === 'InvalidPDFException' || name === 'FormatError') {
    return new CliError('Error: Invalid or corrupted PDF file.');
  }
  return error;
}

/**
 * 读取 PDF 文件并创建解析器，调用方负责 destroy
 *
 * @param pdfPath - PDF 文件的绝对路径
 * @returns 解析器实例
 */
export async function openPdf(pdfPath: string): Promise<PDFParse> {
  const data = await fs.promises.readFile(pdfPath);
  return new PDFParse({ data });
}

/**
 * 获取 PDF 文件的总页数
 *
 * @param parser - 解析器实例
 * @returns 总页数
 */
export async function getTotalPages(parser: PDFParse): Promise<number> {
  try {
    const info = await parser.getInfo();
    return info.total;
  } catch (error) {
    throw toCliError(error);
  }
}

/**
 * 从 PDF 中提取指定页面的文本
 *
 * @param parser - 解析器实例
 * @param pages - 要提取的页码数组
 * @returns 解析器返回的各页文本
 */
export async function extractPages(
  parser: PDFParse,
  pages: number[]
): Promise<PageText[]> {
  try {
    const result = await parser.getText({ partial: pages });
    return result.pages;
  } catch (error) {
    throw toCliError(error);
  }
}

/**
 * 输出缺页或空白页的警告信息
 * @param logger 日志输出
 * @param pageTexts 提取的各页文本
 * @param pages 要提取的页码数组
 */
function pagesWarning(
  logger: Logger,
  pageTexts: PageText[],
  pages: number[]
): void {
  const { missing, empty } = inspectPages(pageTexts, pages);
  if (missing.length > 0) {
    logger.warn(
      `Warning: No text returned for pages: ${buildRangeText(missing)}`
    );
  }
  if (empty.length === pages.length) {
    logger.warn(
      'Warning: No text extracted. The PDF may contain only scanned images (OCR is not supported).'
    );
  } else if (empty.length > 0) {
    logger.warn(`Warning: Pages with no text: ${buildRangeText(empty)}`);
  }
}

/**
 * 程序主入口：解析参数、校验页码、提取文本并输出到文件或 stdout
 *
 * @param args - 命令行参数（不含 node 与脚本路径）
 * @throws {CliError} 可预期的用户错误
 */
export async function main(args: string[]): Promise<void> {
  const options = parseArguments(args);
  if (options === null) {
    showUsage();
    return;
  }

  if (typeof options === 'string') {
    showVersion(options);
    return;
  }

  const { outDir } = options;
  // 输出到 stdout 时，状态信息改走 stderr，避免混入正文
  const logger = createLogger(options.logLevel, (kind, message) => {
    if (kind === 'warn') {
      console.error(paint('yellow', message));
    } else if (kind === 'info' && outDir !== undefined) {
      console.log(message);
    } else {
      console.error(message);
    }
  });
  logger.debug(`Options: out=${outDir ?? 'stdout'}, force=${options.force}`);

  let startTime = performance.now();
  const parser = await openPdf(options.pdfPath);
  logger.debug(`Read PDF: ${elapsedSince(startTime)}`);

  let pages: number[];
  let pageTexts: PageText[];
  try {
    startTime = performance.now();
    const totalPages = await getTotalPages(parser);
    if (totalPages < 1) {
      throw new CliError('Error: PDF has no pages.');
    }

    try {
      pages = parsePageRanges(options.pagesInput, totalPages);
    } catch (error) {
      throw new CliError(`Error: ${(error as Error).message}`);
    }

    logger.info(`PDF: ${options.pdfPath}`);
    logger.info(`Total pages: ${totalPages}`);
    logger.info(`Extracting pages: ${buildRangeText(pages)}`);

    pageTexts = await extractPages(parser, pages);
    logger.debug(`Parse PDF: ${elapsedSince(startTime)}`);
  } finally {
    await parser.destroy();
  }

  for (const page of pageTexts) {
    logger.debug(`Page ${page.num}: ${page.text.length} chars`);
  }
  pagesWarning(logger, pageTexts, pages);
  const output = formatPages(pageTexts, pages);

  if (outDir === undefined) {
    process.stdout.write(output);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(
    outDir,
    getOutputFileName(options.pdfPath, pages)
  );
  startTime = performance.now();
  try {
    // wx 在文件已存在时失败，避免先检查再写入的竞态
    fs.writeFileSync(outputPath, output, {
      encoding: 'utf-8',
      flag: options.force ? 'w' : 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CliError(
        `Error: Output file already exists: ${outputPath} (use --force to overwrite)`
      );
    }
    throw error;
  }

  logger.debug(`Write output: ${elapsedSince(startTime)}`);
  logger.info(`Output saved to: ${outputPath}`);
}
