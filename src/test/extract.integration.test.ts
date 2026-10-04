import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { CliError } from '../scripts/extract.core.ts';
import { getTotalPages, main, openPdf } from '../scripts/extract.lib.ts';

/** 生成每页一行文本的最小 PDF（仅 ASCII，偏移量按字节计算） */
function buildPdf(pageTexts: string[]): Buffer {
  const kids = pageTexts.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  pageTexts.forEach((text, index) => {
    const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

let tmpDir: string;
let pdfPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractlet-it-'));
  pdfPath = path.join(tmpDir, 'sample.pdf');
  fs.writeFileSync(
    pdfPath,
    buildPdf(['First page', 'Second page', 'Third page'])
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('读取真实 PDF 的总页数', async () => {
  const parser = await openPdf(pdfPath);
  try {
    await expect(getTotalPages(parser)).resolves.toBe(3);
  } finally {
    await parser.destroy();
  }
});

it('从真实 PDF 中提取指定页面并写入文件', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => { });
  const outDir = path.join(tmpDir, 'out');

  await main(['--pdf', pdfPath, '--pages', '1,3', '--out', outDir]);

  const output = fs.readFileSync(path.join(outDir, 'sample_1,3.txt'), 'utf-8');
  expect(output.startsWith('===== PAGE 1 =====')).toBe(true);
  expect(output).toContain('First page');
  expect(output).toContain('===== PAGE 3 =====');
  expect(output).toContain('Third page');
  expect(output).not.toContain('Second page');
});

it('输出文件已存在时拒绝覆盖，--force 后覆盖', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => { });
  const outDir = path.join(tmpDir, 'force');
  const args = ['--pdf', pdfPath, '--pages', '2', '--out', outDir];

  await main(args);
  await expect(main(args)).rejects.toBeInstanceOf(CliError);
  await expect(main([...args, '--force'])).resolves.toBeUndefined();
});

it('--out - 时将正文写入 stdout', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => { });
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);

  await main(['--pdf', pdfPath, '--pages', '2', '--out', '-']);

  expect(stdoutSpy).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('Second page')
  );
});

it('损坏的 PDF 给出友好提示', async () => {
  const badPath = path.join(tmpDir, 'bad.pdf');
  fs.writeFileSync(badPath, 'this is not a pdf');

  const error = await main(['--pdf', badPath, '--out', tmpDir]).catch(
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(CliError);
  expect(error).toMatchObject({
    message: 'Error: Invalid or corrupted PDF file.',
  });
});
