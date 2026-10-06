import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { CliError, getUsage } from '../scripts/extract.core.ts';
import {
  extractPages,
  getTotalPages,
  main,
  openPdf,
  paint,
  parseArguments,
  showUsage,
  showVersion,
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

/** 模拟 pdf-parse 的异常类（仅依赖 name 区分） */
function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function catchSync(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw');
}

function expectCliError(error: unknown, message: string, showUsage = false) {
  expect(error).toBeInstanceOf(CliError);
  expect(error).toMatchObject({ message, showUsage });
}

let tmpDir: string;
let pdfPath: string;
let logSpy: MockInstance<typeof console.log>;
let errorSpy: MockInstance<typeof console.error>;
let stdoutSpy: MockInstance<typeof process.stdout.write>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractlet-'));
  pdfPath = path.join(tmpDir, 'sample.pdf');
  fs.writeFileSync(pdfPath, 'fake-pdf');

  logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

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

describe('showVersion', () => {
  it('输出版本号', () => {
    showVersion('1.0.0');
    expect(logSpy).toHaveBeenCalledExactlyOnceWith('v1.0.0');
  });
});

describe('paint', () => {
  let original: typeof process.stderr.hasColors;

  beforeEach(() => {
    original = process.stderr.hasColors;
  });

  afterEach(() => {
    process.stderr.hasColors = original;
  });

  it('stderr 支持颜色时上色', () => {
    process.stderr.hasColors = () => true;
    expect(paint('yellow', 'hi')).toBe('\u001b[33mhi\u001b[39m');
  });

  it('stderr 不支持颜色时原样返回', () => {
    process.stderr.hasColors = () => false;
    expect(paint('yellow', 'hi')).toBe('hi');
  });

  it('stderr 非 TTY（无 hasColors）时原样返回', () => {
    process.stderr.hasColors = undefined as never;
    expect(paint('red', 'hi')).toBe('hi');
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
      force: false,
      logLevel: 'normal',
    });
  });

  it('未指定 --out 时默认为 cwd/output', () => {
    expect(parseArguments(['--pdf', pdfPath])).toEqual({
      pdfPath: path.resolve(pdfPath),
      pagesInput: undefined,
      outDir: path.resolve('output'),
      force: false,
      logLevel: 'normal',
    });
  });

  it('--out - 表示输出到 stdout，并透传 --force 与日志级别', () => {
    expect(
      parseArguments(['--pdf', pdfPath, '--out', '-', '-f', '-q'])
    ).toEqual({
      pdfPath: path.resolve(pdfPath),
      pagesInput: undefined,
      outDir: undefined,
      force: true,
      logLevel: 'quiet',
    });
  });

  it('--help 返回 null', () => {
    expect(parseArguments(['--help'])).toBeNull();
  });

  it('--version 返回版本号', () => {
    expect(parseArguments(['--version'])).toBe(pkg.version);
  });

  it('参数错误时抛出附带用法说明的 CliError', () => {
    expectCliError(
      catchSync(() => parseArguments(['--pdf', pdfPath, '--bogus'])),
      'Error: Unknown option: --bogus',
      true
    );
  });

  it('PDF 文件不存在时抛出 CliError', () => {
    const missing = path.join(tmpDir, 'missing.pdf');
    expectCliError(
      catchSync(() => parseArguments(['--pdf', missing])),
      `Error: PDF file not found: ${path.resolve(missing)}`
    );
  });
});

describe('openPdf', () => {
  it('读取文件内容并创建解析器', async () => {
    await openPdf(pdfPath);
    expect(pdfMock.ctor).toHaveBeenCalledExactlyOnceWith({
      data: fs.readFileSync(pdfPath),
    });
  });
});

describe('getTotalPages', () => {
  it('返回总页数', async () => {
    const parser = await openPdf(pdfPath);
    await expect(getTotalPages(parser)).resolves.toBe(3);
  });

  it.each([
    [
      'PasswordException',
      'Error: PDF is password-protected, which is not supported.',
    ],
    ['InvalidPDFException', 'Error: Invalid or corrupted PDF file.'],
    ['FormatError', 'Error: Invalid or corrupted PDF file.'],
  ])('%s 转换为友好的 CliError', async (name, message) => {
    pdfMock.getInfo.mockRejectedValue(namedError(name));
    const parser = await openPdf(pdfPath);
    expectCliError(
      await getTotalPages(parser).catch((error: unknown) => error),
      message
    );
  });

  it.each([new Error('boom'), 'not an error'])(
    '未知异常原样抛出：%s',
    async thrown => {
      pdfMock.getInfo.mockRejectedValue(thrown);
      const parser = await openPdf(pdfPath);
      await expect(getTotalPages(parser)).rejects.toBe(thrown);
    }
  );
});

describe('extractPages', () => {
  it('返回解析器给出的各页文本', async () => {
    const parser = await openPdf(pdfPath);
    const pages = await extractPages(parser, [1, 3]);
    expect(pdfMock.getText).toHaveBeenCalledWith({ partial: [1, 3] });
    expect(pages).toHaveLength(3);
  });

  it('解析异常同样会转换', async () => {
    pdfMock.getText.mockRejectedValue(namedError('FormatError'));
    const parser = await openPdf(pdfPath);
    expectCliError(
      await extractPages(parser, [1]).catch((error: unknown) => error),
      'Error: Invalid or corrupted PDF file.'
    );
  });
});

describe('main', () => {
  it('只解析一次 PDF，创建输出目录并写入提取结果', async () => {
    const outDir = path.join(tmpDir, 'nested', 'out');
    await main(['--pdf', pdfPath, '--pages', '1-2', '--out', outDir]);

    const outputPath = path.join(outDir, 'sample_1-2.txt');
    expect(fs.readFileSync(outputPath, 'utf-8')).toBe(
      '===== PAGE 1 =====\n\nfirst\n\n===== PAGE 2 =====\n\nsecond'
    );
    expect(pdfMock.ctor).toHaveBeenCalledTimes(1);
    expect(pdfMock.destroy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(`PDF: ${path.resolve(pdfPath)}`);
    expect(logSpy).toHaveBeenCalledWith('Total pages: 3');
    expect(logSpy).toHaveBeenCalledWith('Extracting pages: 1-2');
    expect(logSpy).toHaveBeenCalledWith(`Output saved to: ${outputPath}`);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('输出目录已存在时直接写入，未指定页码时提取全部', async () => {
    await main(['--pdf', pdfPath, '--out', tmpDir]);
    expect(fs.existsSync(path.join(tmpDir, 'sample_1-3.txt'))).toBe(true);
  });

  it('--help 输出用法且不读取 PDF', async () => {
    await main(['--help']);
    expect(logSpy).toHaveBeenCalledExactlyOnceWith(getUsage());
    expect(pdfMock.ctor).not.toHaveBeenCalled();
  });

  it('--version 输出用法且不读取 PDF', async () => {
    await main(['--version']);
    expect(logSpy).toHaveBeenCalledExactlyOnceWith(`v${pkg.version}`);
    expect(pdfMock.ctor).not.toHaveBeenCalled();
  });

  it('--out - 时正文写入 stdout，状态信息写入 stderr', async () => {
    await main(['--pdf', pdfPath, '--pages', '2', '--out', '-']);
    expect(stdoutSpy).toHaveBeenCalledExactlyOnceWith(
      '===== PAGE 2 =====\n\nsecond'
    );
    expect(errorSpy).toHaveBeenCalledWith('Extracting pages: 2');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('页码越界时抛出 CliError 且不提取文本', async () => {
    expectCliError(
      await main([
        '--pdf',
        pdfPath,
        '--pages',
        '0,2,5-9',
        '--out',
        tmpDir,
      ]).catch((error: unknown) => error),
      'Error: Pages out of range (1-3): 0, 5-9'
    );
    expect(pdfMock.getText).not.toHaveBeenCalled();
    expect(pdfMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('页码格式错误时抛出 CliError', async () => {
    expectCliError(
      await main(['--pdf', pdfPath, '--pages', '1a', '--out', tmpDir]).catch(
        (error: unknown) => error
      ),
      'Error: Invalid page range: 1a'
    );
  });

  it('PDF 无页面时抛出 CliError 并释放解析器', async () => {
    pdfMock.getInfo.mockResolvedValue({ total: 0 });
    expectCliError(
      await main(['--pdf', pdfPath, '--out', tmpDir]).catch(
        (error: unknown) => error
      ),
      'Error: PDF has no pages.'
    );
    expect(pdfMock.getText).not.toHaveBeenCalled();
    expect(pdfMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('输出文件已存在时拒绝覆盖', async () => {
    const outputPath = path.join(tmpDir, 'sample_1-3.txt');
    fs.writeFileSync(outputPath, 'old');
    expectCliError(
      await main(['--pdf', pdfPath, '--out', tmpDir]).catch(
        (error: unknown) => error
      ),
      `Error: Output file already exists: ${outputPath} (use --force to overwrite)`
    );
    expect(fs.readFileSync(outputPath, 'utf-8')).toBe('old');
  });

  it('--force 时覆盖已存在的输出文件', async () => {
    const outputPath = path.join(tmpDir, 'sample_1-3.txt');
    fs.writeFileSync(outputPath, 'old');
    await main(['--pdf', pdfPath, '--out', tmpDir, '--force']);
    expect(fs.readFileSync(outputPath, 'utf-8')).toContain('third');
  });

  it('其他写入错误原样抛出', async () => {
    fs.mkdirSync(path.join(tmpDir, 'sample_1-3.txt'));
    const error = await main(['--pdf', pdfPath, '--out', tmpDir, '-f']).catch(
      (thrown: unknown) => thrown
    );
    expect(error).not.toBeInstanceOf(CliError);
    expect(error).toMatchObject({ code: 'EISDIR' });
  });

  it('对缺页与空白页输出警告', async () => {
    pdfMock.getText.mockResolvedValue({
      pages: [
        { num: 1, text: 'first' },
        { num: 3, text: '  \n' },
      ],
    });
    await main(['--pdf', pdfPath, '--out', tmpDir]);
    expect(errorSpy).toHaveBeenCalledWith(
      'Warning: No text returned for pages: 2'
    );
    expect(errorSpy).toHaveBeenCalledWith('Warning: Pages with no text: 3');
  });

  it('全部页面无文本时提示可能是扫描件', async () => {
    pdfMock.getText.mockResolvedValue({
      pages: [
        { num: 1, text: '' },
        { num: 2, text: ' ' },
      ],
    });
    await main(['--pdf', pdfPath, '--pages', '1-2', '--out', tmpDir]);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      'Warning: No text extracted. The PDF may contain only scanned images (OCR is not supported).'
    );
  });

  it('--quiet 时不输出状态信息，但保留警告', async () => {
    pdfMock.getText.mockResolvedValue({
      pages: [
        { num: 1, text: 'first' },
        { num: 2, text: '' },
      ],
    });
    await main(['--pdf', pdfPath, '--pages', '1-2', '--out', tmpDir, '-q']);
    expect(fs.existsSync(path.join(tmpDir, 'sample_1-2.txt'))).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      'Warning: Pages with no text: 2'
    );
  });

  it('--verbose 时输出选项、各阶段耗时与每页字符数', async () => {
    await main(['--pdf', pdfPath, '--pages', '1,3', '--out', tmpDir, '-v']);
    expect(errorSpy).toHaveBeenCalledWith(
      `Options: out=${path.resolve(tmpDir)}, force=false`
    );
    for (const phase of ['Read PDF', 'Parse PDF', 'Write output']) {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${phase}: \\d+ ms$`))
      );
    }
    expect(errorSpy).toHaveBeenCalledWith('Page 1: 5 chars');
    expect(errorSpy).toHaveBeenCalledWith('Page 3: 5 chars');
    expect(logSpy).toHaveBeenCalledWith('Total pages: 3');
  });

  it('--verbose 且输出到 stdout 时，选项中的输出目标为 stdout', async () => {
    await main(['--pdf', pdfPath, '--out', '-', '--verbose']);
    expect(errorSpy).toHaveBeenCalledWith('Options: out=stdout, force=false');
    expect(logSpy).not.toHaveBeenCalled();
  });
});
