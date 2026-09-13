import { lazy, type ComponentType } from 'react';

/**
 * 包装 React.lazy，当遭遇 Vite 重新打包导致的旧 Chunk 404 (Failed to fetch dynamically imported module) 时，
 * 自动清理缓存并刷新当前页面，实现无感热更新并避免白屏崩溃。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 与 React.lazy 的约束保持一致，需接受任意 props 的组件
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  name?: string,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem(`retry-lazy-refreshed-${name || 'chunk'}`) || 'false',
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem(`retry-lazy-refreshed-${name || 'chunk'}`, 'false');
      return component;
    } catch (error) {
      const err = error as { message?: string; name?: string } | undefined;
      const isDynamicImportError =
        err?.message?.includes('Failed to fetch dynamically imported module') ||
        err?.message?.includes('Importing a module script failed') ||
        err?.name === 'ChunkLoadError';

      if (!pageHasAlreadyBeenForceRefreshed && isDynamicImportError) {
        window.sessionStorage.setItem(`retry-lazy-refreshed-${name || 'chunk'}`, 'true');
        window.location.reload();
        return new Promise(() => {}); // 挂起直到页面刷新
      }

      throw error;
    }
  });
}
