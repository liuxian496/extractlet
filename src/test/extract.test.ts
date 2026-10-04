import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mainMock = vi.hoisted(() => vi.fn());

vi.mock('../scripts/extract.lib.ts', () => ({
  main: mainMock,
  paint: (_format: unknown, text: string) => text,
}));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  mainMock.mockReset();
  process.exitCode = undefined;
});

/** 在同一模块实例下加载 core 与入口，保证 instanceof CliError 成立 */
async function runEntry() {
  const core = await import('../scripts/extract.core.ts');
  await import('../scripts/extract.ts');
  return core;
}

it('以命令行参数调用 main', async () => {
  mainMock.mockResolvedValue(undefined);

  await runEntry();

  expect(mainMock).toHaveBeenCalledWith(process.argv.slice(2));
  expect(process.exitCode).toBeUndefined();
});

it('CliError 只输出错误信息并设置退出码 1', async () => {
  const { CliError } = await import('../scripts/extract.core.ts');
  mainMock.mockRejectedValue(new CliError('Error: boom'));
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

  await runEntry();

  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(errorSpy).toHaveBeenCalledExactlyOnceWith('Error: boom');
});

it('CliError 需要时附带用法说明', async () => {
  const { CliError, getUsage } = await import('../scripts/extract.core.ts');
  mainMock.mockRejectedValue(new CliError('Error: bad args', true));
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

  await runEntry();

  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(errorSpy).toHaveBeenNthCalledWith(1, 'Error: bad args');
  expect(errorSpy).toHaveBeenNthCalledWith(2, getUsage());
});

it('其他错误输出完整错误对象并设置退出码 1', async () => {
  const error = new Error('boom');
  mainMock.mockRejectedValue(error);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

  await runEntry();

  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(errorSpy).toHaveBeenCalledWith(error);
});
