import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import {
  buildRangeText,
  createLogger,
  formatPages,
  getOutputFileName,
  getUsage,
  inspectPages,
  parseCliArgs,
  parsePageRanges,
} from '../scripts/extract.core.ts';
import type { LogLevel } from '../scripts/extract.core.types.ts';
import pkg from '../../package.json' with { type: 'json' };

interface CoreCaseProps {
  /** 被测调用 / Call under test */
  run: () => unknown;
  /** 期望返回值 / Expected return value */
  expected?: unknown;
  /** 期望抛出的错误文本 / Expected thrown error text */
  error?: string;
}

/** 渲染被测调用的返回值（JSON）或抛出的错误 / Renders the call result as JSON or the thrown error */
function CoreCase({ run }: CoreCaseProps) {
  let result: string;
  try {
    result = JSON.stringify(run());
  } catch (error) {
    return <p role="alert">{String(error)}</p>;
  }
  return <output>{result}</output>;
}

const meta = {
  title: 'Scripts/extractCore',
  component: CoreCase,
  parameters: {
    layout: 'centered',
  },
  play: async ({ args, canvas }) => {
    if (args.error === undefined) {
      await expect(canvas.getByRole('status').textContent).toBe(
        JSON.stringify(args.expected)
      );
    } else {
      await expect(canvas.getByRole('alert').textContent).toBe(args.error);
    }
  },
} satisfies Meta<typeof CoreCase>;

export default meta;
type Story = StoryObj<typeof meta>;

const invalidRange = (input: string, segment = input): Story => ({
  name: `parsePageRanges：非法输入 ${JSON.stringify(input)} 抛出 TypeError`,
  args: {
    run: () => parsePageRanges(input, 10),
    error: `TypeError: Invalid page range: ${segment}`,
  },
});

// ---------- parsePageRanges ----------

export const ParseAllPagesWhenUndefined: Story = {
  name: 'parsePageRanges：未指定时返回全部页',
  args: { run: () => parsePageRanges(undefined, 3), expected: [1, 2, 3] },
};

export const ParseAllPagesWhenEmpty: Story = {
  name: 'parsePageRanges：空字符串返回全部页',
  args: { run: () => parsePageRanges('', 3), expected: [1, 2, 3] },
};

export const ParseAllPagesWhenBlank: Story = {
  name: 'parsePageRanges：空白字符串返回全部页',
  args: { run: () => parsePageRanges('   ', 3), expected: [1, 2, 3] },
};

export const ParseSinglePage: Story = {
  name: 'parsePageRanges：单页',
  args: { run: () => parsePageRanges('2', 5), expected: [2] },
};

export const ParseContiguousRange: Story = {
  name: 'parsePageRanges：连续范围',
  args: { run: () => parsePageRanges('2-4', 5), expected: [2, 3, 4] },
};

export const ParseSameStartEnd: Story = {
  name: 'parsePageRanges：首尾相同的范围',
  args: { run: () => parsePageRanges('3-3', 5), expected: [3] },
};

export const ParseMixedDedupSorted: Story = {
  name: 'parsePageRanges：混合形式去重并排序',
  args: {
    run: () => parsePageRanges('10, 1 - 3,2,5', 10),
    expected: [1, 2, 3, 5, 10],
  },
};

export const ParseOutOfRange: Story = {
  name: 'parsePageRanges：列出所有越界段',
  args: {
    run: () => parsePageRanges('0,2,4-6', 3),
    error: 'RangeError: Pages out of range (1-3): 0, 4-6',
  },
};

export const ParseHugeRangeFailsFast: Story = {
  name: 'parsePageRanges：超大范围不展开直接报错',
  args: {
    run: () => parsePageRanges('1-999999999', 3),
    error: 'RangeError: Pages out of range (1-3): 1-999999999',
  },
};

export const ParseInvalidEmptySegment = invalidRange('1,,2', '');
export const ParseInvalidNonNumeric = invalidRange('abc');
export const ParseInvalidTrailingChars = invalidRange('1a');
export const ParseInvalidMultipleDashes = invalidRange('1-2-3');
export const ParseInvalidMissingStart = invalidRange('-5');
export const ParseInvalidMissingEnd = invalidRange('5-');
export const ParseInvalidReversed = invalidRange('5-1');
export const ParseInvalidDecimal = invalidRange('1.5');

// ---------- buildRangeText ----------

export const RangeTextEmpty: Story = {
  name: 'buildRangeText：空数组返回 empty',
  args: { run: () => buildRangeText([]), expected: 'empty' },
};

export const RangeTextSingle: Story = {
  name: 'buildRangeText：单页',
  args: { run: () => buildRangeText([7]), expected: '7' },
};

export const RangeTextContiguous: Story = {
  name: 'buildRangeText：连续页压缩为范围',
  args: { run: () => buildRangeText([1, 2, 3]), expected: '1-3' },
};

export const RangeTextDiscrete: Story = {
  name: 'buildRangeText：不连续页以逗号分隔',
  args: { run: () => buildRangeText([1, 3, 5]), expected: '1,3,5' },
};

export const RangeTextMixed: Story = {
  name: 'buildRangeText：混合形式',
  args: {
    run: () => buildRangeText([1, 2, 3, 5, 7, 8]),
    expected: '1-3,5,7-8',
  },
};

// ---------- getOutputFileName ----------

export const FileNamePosix: Story = {
  name: 'getOutputFileName：POSIX 路径',
  args: {
    run: () => getOutputFileName('/a/b/report.pdf', [1, 2, 4]),
    expected: 'report_1-2,4.txt',
  },
};

export const FileNameWindows: Story = {
  name: 'getOutputFileName：Windows 路径',
  args: {
    run: () => getOutputFileName('C:\\docs\\report.pdf', [3]),
    expected: 'report_3.txt',
  },
};

export const FileNameMultipleDots: Story = {
  name: 'getOutputFileName：仅去掉最后一个扩展名',
  args: {
    run: () => getOutputFileName('/a/my.report.pdf', [1]),
    expected: 'my.report_1.txt',
  },
};

export const FileNameNoExtension: Story = {
  name: 'getOutputFileName：无扩展名',
  args: {
    run: () => getOutputFileName('README', [1]),
    expected: 'README_1.txt',
  },
};

export const FileNameDotFile: Story = {
  name: 'getOutputFileName：以点开头的文件名视为无扩展名',
  args: {
    run: () => getOutputFileName('/a/.hidden', [1]),
    expected: '.hidden_1.txt',
  },
};

export const FileNameChinese: Story = {
  name: 'getOutputFileName：中文文件名',
  args: {
    run: () => getOutputFileName('/a/需求文档.pdf', [5, 6]),
    expected: '需求文档_5-6.txt',
  },
};

export const FileNameTooLong: Story = {
  name: 'getOutputFileName：文件名过长时改用首末页与页数',
  args: {
    run: () =>
      getOutputFileName(
        '/a/report.pdf',
        Array.from({ length: 100 }, (_, index) => index * 2 + 1)
      ),
    expected: 'report_1-199_100pages.txt',
  },
};

// ---------- inspectPages ----------

export const InspectPagesAllPresent: Story = {
  name: 'inspectPages：全部页都有文本',
  args: {
    run: () => inspectPages([{ num: 1, text: 'a' }], [1]),
    expected: { missing: [], empty: [] },
  },
};

export const InspectPagesMissingAndEmpty: Story = {
  name: 'inspectPages：识别缺失页与空白页',
  args: {
    run: () =>
      inspectPages(
        [
          { num: 1, text: 'a' },
          { num: 3, text: ' \n\t' },
        ],
        [1, 2, 3]
      ),
    expected: { missing: [2], empty: [3] },
  },
};

// ---------- formatPages ----------

const samplePages = [
  { num: 1, text: 'first' },
  { num: 2, text: 'second' },
  { num: 3, text: 'third' },
];

export const FormatPagesFiltered: Story = {
  name: 'formatPages：按页拼接并过滤未请求的页',
  args: {
    run: () => formatPages(samplePages, [1, 3]),
    expected: '===== PAGE 1 =====\n\nfirst\n\n===== PAGE 3 =====\n\nthird',
  },
};

export const FormatPagesNoMatch: Story = {
  name: 'formatPages：无匹配页时返回空字符串',
  args: { run: () => formatPages(samplePages, [9]), expected: '' },
};

export const FormatPagesEmptyPages: Story = {
  name: 'formatPages：pages 为空时返回空字符串',
  args: { run: () => formatPages(samplePages, []), expected: '' },
};

export const FormatPagesOrderByPages: Story = {
  name: 'formatPages：按 pages 顺序输出',
  args: {
    run: () =>
      formatPages(
        [
          { num: 3, text: 'third' },
          { num: 1, text: 'first' },
        ],
        [1, 3]
      ),
    expected: '===== PAGE 1 =====\n\nfirst\n\n===== PAGE 3 =====\n\nthird',
  },
};

// ---------- parseCliArgs ----------

export const CliLongOptions: Story = {
  name: 'parseCliArgs：长参数',
  args: {
    run: () =>
      parseCliArgs(['--pdf', 'a.pdf', '--pages', '1-2', '--out', 'dist']),
    expected: {
      action: 'run',
      pdfPath: 'a.pdf',
      pagesInput: '1-2',
      outDir: 'dist',
      force: false,
      logLevel: 'normal',
    },
  },
};

export const CliShortOptions: Story = {
  name: 'parseCliArgs：短参数',
  args: {
    run: () => parseCliArgs(['-p', 'a.pdf', '-r', '3', '-o', 'dist', '-f']),
    expected: {
      action: 'run',
      pdfPath: 'a.pdf',
      pagesInput: '3',
      outDir: 'dist',
      force: true,
      logLevel: 'normal',
    },
  },
};

export const CliEqualsSyntax: Story = {
  name: 'parseCliArgs：长参数支持 = 写法',
  args: {
    run: () =>
      parseCliArgs(['--pdf=a=b.pdf', '--pages=-1', '--out=-', '--force']),
    expected: {
      action: 'run',
      pdfPath: 'a=b.pdf',
      pagesInput: '-1',
      outDir: '-',
      force: true,
      logLevel: 'normal',
    },
  },
};

export const CliStdoutDash: Story = {
  name: 'parseCliArgs：单独的 - 可作为取值',
  args: {
    run: () => parseCliArgs(['-p', 'a.pdf', '-o', '-']),
    expected: {
      action: 'run',
      pdfPath: 'a.pdf',
      pagesInput: undefined,
      outDir: '-',
      force: false,
      logLevel: 'normal',
    },
  },
};

export const CliOnlyPdf: Story = {
  name: 'parseCliArgs：仅指定 --pdf',
  args: {
    run: () => parseCliArgs(['--pdf', 'a.pdf']),
    expected: {
      action: 'run',
      pdfPath: 'a.pdf',
      pagesInput: undefined,
      outDir: undefined,
      force: false,
      logLevel: 'normal',
    },
  },
};

export const CliQuietShort: Story = {
  name: 'parseCliArgs：-q 设置 quiet 级别',
  args: {
    run: () => parseCliArgs(['-p', 'a.pdf', '-q']),
    expected: {
      action: 'run',
      pdfPath: 'a.pdf',
      pagesInput: undefined,
      outDir: undefined,
      force: false,
      logLevel: 'quiet',
    },
  },
};

export const CliVerboseLong: Story = {
  name: 'parseCliArgs：--verbose 设置 verbose 级别',
  args: {
    run: () => parseCliArgs(['--verbose', '-p', 'a.pdf']),
    expected: {
      action: 'run',
      pdfPath: 'a.pdf',
      pagesInput: undefined,
      outDir: undefined,
      force: false,
      logLevel: 'verbose',
    },
  },
};

export const CliHelpLong: Story = {
  name: 'parseCliArgs：--help 优先于其他参数及错误',
  args: {
    run: () => parseCliArgs(['--bogus', '--pdf', 'a.pdf', '--help']),
    expected: { action: 'help' },
  },
};

export const CliHelpShort: Story = {
  name: 'parseCliArgs：-h',
  args: { run: () => parseCliArgs(['-h']), expected: { action: 'help' } },
};

export const CliHelpVersion: Story = {
  name: 'parseCliArgs：--version',
  args: { run: () => parseCliArgs(['--version']), expected: { action: 'version', version: pkg.version } },
}

export const CliMissingPdf: Story = {
  name: 'parseCliArgs：缺少 --pdf 时返回错误',
  args: {
    run: () => parseCliArgs(['--pages', '1']),
    expected: { action: 'error', message: 'Error: --pdf is required.' },
  },
};

const cliError = (name: string, args: string[], message: string): Story => ({
  name: `parseCliArgs：${name}`,
  args: {
    run: () => parseCliArgs(args),
    expected: { action: 'error', message: `Error: ${message}` },
  },
});

export const CliUnknownOption = cliError(
  '未知选项报错',
  ['--debug', '-p', 'a.pdf'],
  'Unknown option: --debug'
);
export const CliUnknownOptionWithValue = cliError(
  '带 = 的未知选项只报选项名',
  ['--bogus=1'],
  'Unknown option: --bogus'
);
export const CliUnexpectedArgument = cliError(
  '多余的位置参数报错',
  ['a.pdf'],
  'Unexpected argument: a.pdf'
);
export const CliMissingValueAtEnd = cliError(
  '末尾选项缺少取值',
  ['--pdf'],
  '--pdf requires a value.'
);
export const CliMissingValueBeforeOption = cliError(
  '取值位置是另一个选项',
  ['-p', 'a.pdf', '--pages', '--out', 'dist'],
  '--pages requires a value.'
);
export const CliEmptyEqualsValue = cliError(
  '= 后为空值',
  ['--pdf='],
  '--pdf requires a value.'
);
export const CliForceWithValue = cliError(
  '--force 不接受取值',
  ['--force=yes', '-p', 'a.pdf'],
  '--force does not take a value.'
);
export const CliVerboseWithValue = cliError(
  '--verbose 不接受取值',
  ['-p', 'a.pdf', '--verbose=1'],
  '--verbose does not take a value.'
);
export const CliQuietVerboseConflict = cliError(
  '--quiet 与 --verbose 不能同时使用',
  ['-p', 'a.pdf', '-q', '-v'],
  '--quiet and --verbose cannot be used together.'
);

// ---------- createLogger ----------

/** 依次调用 info / warn / debug，返回实际被输出的消息 */
const collectLogs = (level: LogLevel) => {
  const lines: string[] = [];
  const logger = createLogger(level, (kind, message) =>
    lines.push(`[${kind}] ${message}`)
  );
  logger.info('Total pages: 3');
  logger.warn('Warning: Pages with no text: 2');
  logger.debug('Page 1: 120 chars');
  return lines;
};

export const LoggerNormal: Story = {
  name: 'createLogger：normal 输出 info 与 warn',
  args: {
    run: () => collectLogs('normal'),
    expected: [
      '[info] Total pages: 3',
      '[warn] Warning: Pages with no text: 2',
    ],
  },
};

export const LoggerQuiet: Story = {
  name: 'createLogger：quiet 只保留 warn',
  args: {
    run: () => collectLogs('quiet'),
    expected: ['[warn] Warning: Pages with no text: 2'],
  },
};

export const LoggerVerbose: Story = {
  name: 'createLogger：verbose 额外输出 debug',
  args: {
    run: () => collectLogs('verbose'),
    expected: [
      '[info] Total pages: 3',
      '[warn] Warning: Pages with no text: 2',
      '[debug] Page 1: 120 chars',
    ],
  },
};

// ---------- getUsage ----------

export const Usage: Story = {
  name: 'getUsage：包含用法与全部选项',
  args: { run: getUsage },
  play: async ({ canvas }) => {
    const usage = JSON.parse(
      canvas.getByRole('status').textContent ?? ''
    ) as string;
    await expect(usage.startsWith('Usage:')).toBe(true);
    for (const option of [
      '-p, --pdf <path>',
      '-r, --pages <range>',
      '-o, --out <dir>',
      '-f, --force',
      '-q, --quiet',
      '-v, --verbose',
      '-h, --help',
      '-V', '--version',
    ]) {
      await expect(usage).toContain(option);
    }
  },
};
