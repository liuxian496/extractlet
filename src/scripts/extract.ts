#!/usr/bin/env node
import { CliError, getUsage } from './extract.core.ts';
import { main, paint } from './extract.lib.ts';

/**
 * PDF 页面文本提取工具
 *
 * 从指定 PDF 文件中提取选定页码的文本内容，并保存到输出目录（默认为当前目录下的 output/）
 *
 * 用法 / Usage:
 *   extractlet --pdf "path/to/file.pdf" --pages 22-37
 *   extractlet --pdf "path/to/file.pdf" --pages 5,10,15
 *   extractlet --pdf "path/to/file.pdf" --out "path/to/dir"
 *   extractlet --pdf "path/to/file.pdf" --out -        # 输出到 stdout
 *   extractlet --pdf "path/to/file.pdf"             # 提取所有页面
 */

// 用 exitCode 而非 exit()，保证 stdout 中尚未写完的内容能完整输出
main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof CliError) {
    console.error(paint('red', error.message));
    if (error.showUsage) {
      console.error(getUsage());
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
