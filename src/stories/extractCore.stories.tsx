import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import {
  buildRangeText,
  findInvalidPages,
  formatPages,
  getOutputFileName,
  getUsage,
  parseCliArgs,
  parsePageRanges,
} from '../scripts/extract.core.ts';

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

export const ParseNoUpperBoundCheck: Story = {
  name: 'parsePageRanges：不校验总页数上限',
  args: { run: () => parsePageRanges('0,9', 3), expected: [0, 9] },
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

// ---------- findInvalidPages ----------

export const InvalidPagesNone: Story = {
  name: 'findInvalidPages：全部在范围内',
  args: { run: () => findInvalidPages([1, 2, 3], 3), expected: [] },
};

export const InvalidPagesOutOfRange: Story = {
  name: 'findInvalidPages：返回越界页码',
  args: { run: () => findInvalidPages([0, 2, 5], 3), expected: [0, 5] },
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
    expected: '\n\n===== PAGE 1 =====\n\nfirst\n\n===== PAGE 3 =====\n\nthird',
  },
};

export const FormatPagesNoMatch: Story = {
  name: 'formatPages：无匹配页时返回空字符串',
  args: { run: () => formatPages(samplePages, [9]), expected: '' },
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
    },
  },
};

export const CliShortOptions: Story = {
  name: 'parseCliArgs：短参数并忽略未知参数',
  args: {
    run: () =>
      parseCliArgs(['--verbose', '-p', 'a.pdf', '-r', '3', '-o', 'dist']),
    expected: {
      action: 'run',
      pdfPath: 'a.pdf',
      pagesInput: '3',
      outDir: 'dist',
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
    },
  },
};

export const CliHelpLong: Story = {
  name: 'parseCliArgs：--help 优先于其他参数',
  args: {
    run: () => parseCliArgs(['--pdf', 'a.pdf', '--help']),
    expected: { action: 'help' },
  },
};

export const CliHelpShort: Story = {
  name: 'parseCliArgs：-h',
  args: { run: () => parseCliArgs(['-h']), expected: { action: 'help' } },
};

export const CliMissingPdf: Story = {
  name: 'parseCliArgs：缺少 --pdf 时返回错误',
  args: {
    run: () => parseCliArgs(['--pages', '1']),
    expected: { action: 'error', message: 'Error: --pdf is required.' },
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
      '-h, --help',
    ]) {
      await expect(usage).toContain(option);
    }
  },
};
