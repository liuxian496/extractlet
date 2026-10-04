import type { LogLevel } from './extract.core.types.ts';

export interface ExtractOptions {
	pdfPath: string;
	pagesInput: string | undefined;
	/** 输出目录的绝对路径；undefined 表示输出到 stdout */
	outDir: string | undefined;
	force: boolean;
	logLevel: LogLevel;
}
