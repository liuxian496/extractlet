#!/usr/bin/env node
import { main } from './extract.lib.ts';

/**
 * PDF 页面文本提取工具
 *
 * 从指定 PDF 文件中提取选定页码的文本内容，并保存到输出目录（默认为当前目录下的 output/）
 *
 * 用法 / Usage:
 *   extractlet --pdf "path/to/file.pdf" --pages 22-37
 *   extractlet --pdf "path/to/file.pdf" --pages 5,10,15
 *   extractlet --pdf "path/to/file.pdf" --out "path/to/dir"
 *   extractlet --pdf "path/to/file.pdf"             # 提取所有页面
 */

// 启动程序，捕获未处理的异步错误
main(process.argv.slice(2)).catch(error => {
  console.error(error);
  process.exit(1);
});
