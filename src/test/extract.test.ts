import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mainMock = vi.hoisted(() => vi.fn());

vi.mock('../scripts/extract.lib.ts', () => ({ main: mainMock }));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  mainMock.mockReset();
});

it('以命令行参数调用 main', async () => {
  mainMock.mockResolvedValue(undefined);
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    return undefined as never;
  });

  await import('../scripts/extract.ts');

  expect(mainMock).toHaveBeenCalledWith(process.argv.slice(2));
  expect(exitSpy).not.toHaveBeenCalled();
});

it('main 抛错时输出错误并以 1 退出', async () => {
  const error = new Error('boom');
  mainMock.mockRejectedValue(error);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    return undefined as never;
  });

  await import('../scripts/extract.ts');

  await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
  expect(errorSpy).toHaveBeenCalledWith(error);
});
