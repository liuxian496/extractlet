import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { getUsage } from '../scripts/extract.core.ts';
import {
  extractPages,
  getTotalPages,
  main,
  parseArguments,
  showUsage,
} from '../scripts/extract.lib.ts';

const pdfMock = vi.hoisted(() => ({
  ctor: vi.fn(),
  getInfo: vi.fn(),
  getText: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getInfo = pdfMock.getInfo;
    getText = pdfMock.getText;
    destroy = pdfMock.destroy;
    constructor(options: unknown) {
      pdfMock.ctor(options);
    }
  },
}));

let tmpDir: string;
let pdfPath: string;
let logSpy: MockInstance<typeof console.log>;
let errorSpy: MockInstance<typeof console.error>;
let exitSpy: MockInstance<typeof process.exit>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractlet-'));
  pdfPath = path.join(tmpDir, 'sample.pdf');
  fs.writeFileSync(pdfPath, 'fake-pdf');

  logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`exit ${code}`);
  });

  pdfMock.getInfo.mockResolvedValue({ total: 3 });
  pdfMock.getText.mockResolvedValue({
    pages: [
      { num: 1, text: 'first' },
      { num: 2, text: 'second' },
      { num: 3, text: 'third' },
    ],
  });
  pdfMock.destroy.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('showUsage', () => {
  it('输出用法说明', () => {
    showUsage();
    expect(logSpy).toHaveBeenCalledExactlyOnceWith(getUsage());
  });
});

describe('parseArguments', () => {
  it('将路径解析为绝对路径', () => {
    const outDir = path.join(tmpDir, 'out');
    expect(
      parseArguments(['--pdf', pdfPath, '--pages', '1-2', '--out', outDir])
    ).toEqual({
      pdfPath: path.resolve(pdfPath),
      pagesInput: '1-2',
      outDir: path.resolve(outDir),
    });
  });

  it('未指定 --out 时默认为 cwd/output', () => {
    expect(parseArguments(['--pdf', pdfPath])).toEqual({
      pdfPath: path.resolve(pdfPath),
      pagesInput: undefined,
      outDir: path.resolve('output'),
    });
  });

  it('--help 显示帮助并以 0 退出', () => {
    expect(() => parseArguments(['--help'])).toThrow('exit 0');
    expect(logSpy).toHaveBeenCalledWith(getUsage());
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('缺少 --pdf 时报错并以 1 退出', () => {
    expect(() => parseArguments([])).toThrow('exit 1');
    expect(errorSpy).toHaveBeenCalledWith('Error: --pdf is required.');
    expect(logSpy).toHaveBeenCalledWith(getUsage());
  });

  it('PDF 文件不存在时报错并以 1 退出', () => {
    const missing = path.join(tmpDir, 'missing.pdf');
    expect(() => parseArguments(['--pdf', missing])).toThrow('exit 1');
    expect(errorSpy).toHaveBeenCalledWith(
      `Error: PDF file not found: ${path.resolve(missing)}`
    );
  });
});

describe('getTotalPages', () => {
  it('返回总页数并释放解析器', async () => {
    await expect(getTotalPages(pdfPath)).resolves.toBe(3);
    expect(pdfMock.ctor).toHaveBeenCalledWith({
      data: fs.readFileSync(pdfPath),
    });
    expect(pdfMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('解析失败时仍释放解析器', async () => {
    pdfMock.getInfo.mockRejectedValue(new Error('bad pdf'));
    await expect(getTotalPages(pdfPath)).rejects.toThrow('bad pdf');
    expect(pdfMock.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('extractPages', () => {
  it('按页拼接文本并过滤未请求的页', async () => {
    const output = await extractPages(pdfPath, [1, 3]);
    expect(pdfMock.getText).toHaveBeenCalledWith({ partial: [1, 3] });
    expect(output).toBe(
      '\n\n===== PAGE 1 =====\n\nfirst\n\n===== PAGE 3 =====\n\nthird'
    );
    expect(pdfMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('提取失败时仍释放解析器', async () => {
    pdfMock.getText.mockRejectedValue(new Error('bad text'));
    await expect(extractPages(pdfPath, [1])).rejects.toThrow('bad text');
    expect(pdfMock.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('main', () => {
  it('创建输出目录并写入提取结果', async () => {
    const outDir = path.join(tmpDir, 'nested', 'out');
    await main(['--pdf', pdfPath, '--pages', '1-2', '--out', outDir]);

    const outputPath = path.join(outDir, 'sample_1-2.txt');
    expect(fs.readFileSync(outputPath, 'utf-8')).toBe(
      '\n\n===== PAGE 1 =====\n\nfirst\n\n===== PAGE 2 =====\n\nsecond'
    );
    expect(logSpy).toHaveBeenCalledWith(`PDF: ${path.resolve(pdfPath)}`);
    expect(logSpy).toHaveBeenCalledWith('Total pages: 3');
    expect(logSpy).toHaveBeenCalledWith('Extracting pages: 1-2');
    expect(logSpy).toHaveBeenCalledWith(`Output saved to: ${outputPath}`);
  });

  it('输出目录已存在时直接写入，未指定页码时提取全部', async () => {
    await main(['--pdf', pdfPath, '--out', tmpDir]);
    expect(fs.existsSync(path.join(tmpDir, 'sample_1-3.txt'))).toBe(true);
  });

  it('页码越界时报错并以 1 退出', async () => {
    await expect(
      main(['--pdf', pdfPath, '--pages', '0,2,5', '--out', tmpDir])
    ).rejects.toThrow('exit 1');
    expect(errorSpy).toHaveBeenCalledWith(
      'Error: Pages out of range (1-3): 0, 5'
    );
    expect(pdfMock.getText).not.toHaveBeenCalled();
  });

  it('PDF 无页面时报错并以 1 退出', async () => {
    pdfMock.getInfo.mockResolvedValue({ total: 0 });
    await expect(main(['--pdf', pdfPath, '--out', tmpDir])).rejects.toThrow(
      'exit 1'
    );
    expect(errorSpy).toHaveBeenCalledWith('Error: PDF has no pages.');
    expect(pdfMock.getText).not.toHaveBeenCalled();
  });
});
