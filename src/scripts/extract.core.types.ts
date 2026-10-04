export interface PageText {
  num: number;
  text: string;
}

/** quiet 只保留警告，verbose 额外输出调试信息 */
export type LogLevel = 'quiet' | 'normal' | 'verbose';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

export type LogKind = keyof Logger;
