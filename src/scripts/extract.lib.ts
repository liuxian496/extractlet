import * as fs from 'node:fs';
import * as path from 'node:path';
import { PDFParse } from 'pdf-parse';
import {
  buildRangeText,
  findInvalidPages,
  formatPages,
  getOutputFileName,
  getUsage,
  parseCliArgs,
  parsePageRanges,
} from './extract.core.ts';
import type { ExtractOptions } from './extract.types.ts';

/**
 * 在控制台显示命令行使用说明
 */
export function showUsage(): void {
  console.log(getUsage());
}

/**
 * 解析命令行参数并校验 PDF 文件是否存在
 * 解析命令行参数并校验 PDF 文件是否存在
 *
 * @param args - 命令行参数（不含 node 与脚本路径）
 * @returns 解析后的提取选项
 * @throws 当缺少必要参数或文件不存在时，调用 process.exit 退出
 */
export function parseArguments(args: string[]): ExtractOptions {
  const command = parseCliArgs(args);
  if (command.action === 'help') {
    showUsage();
    process.exit(0);
  }

  if (command.action === 'error') {
    console.error(command.message);
    showUsage();
    process.exit(1);
  }

  const absolutePath = path.resolve(command.pdfPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: PDF file not found: ${absolutePath}`);
    process.exit(1);
  }

  return {
    pdfPath: absolutePath,
    pagesInput: command.pagesInput,
    outDir: path.resolve(command.outDir ?? 'output'),
  };
}

/**
 * 获取 PDF 文件的总页数
 *
 * @param pdfPath - PDF 文件的绝对路径
 * @returns 总页数
 */
export async function getTotalPages(pdfPath: string): Promise<number> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const info = await parser.getInfo();
    return info.total;
  } finally {
    await parser.destroy();
  }
}

/**
 * 从 PDF 中提取指定页面的文本，并按页分隔返回
 *
 * @param pdfPath - PDF 文件的绝对路径
 * @param pages - 要提取的页码数组
 * @returns 合并后的文本内容，包含页码分隔标记
 */
export async function extractPages(
  pdfPath: string,
  pages: number[]
): Promise<string> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const result = await parser.getText({ partial: pages });
    return formatPages(result.pages, pages);
  } finally {
    await parser.destroy();
  }
}

/**
 * 程序主入口：解析参数、校验页码、提取文本并保存到文件
 *
 * @param args - 命令行参数（不含 node 与脚本路径）
 */
export async function main(args: string[]): Promise<void> {
  const options = parseArguments(args);
  const totalPages = await getTotalPages(options.pdfPath);
  if (totalPages < 1) {
    console.error('Error: PDF has no pages.');
    process.exit(1);
  }

  const pageRanges = parsePageRanges(options.pagesInput, totalPages);

  const invalidPages = findInvalidPages(pageRanges, totalPages);
  if (invalidPages.length > 0) {
    console.error(
      `Error: Pages out of range (1-${totalPages}): ${invalidPages.join(', ')}`
    );
    process.exit(1);
  }

  console.log(`PDF: ${options.pdfPath}`);
  console.log(`Total pages: ${totalPages}`);
  console.log(`Extracting pages: ${buildRangeText(pageRanges)}`);

  const output = await extractPages(options.pdfPath, pageRanges);
  const outputDir = options.outDir;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFileName = getOutputFileName(options.pdfPath, pageRanges);
  const outputPath = path.join(outputDir, outputFileName);
  fs.writeFileSync(outputPath, output, 'utf-8');

  console.log(`Output saved to: ${outputPath}`);
}
