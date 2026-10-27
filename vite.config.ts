import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对路径，方便部署到 GitHub Pages 的子目录
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    // CI 机器比本机慢一倍以上：30年长局等测试本机约2–3秒，默认5秒上限在 Actions 上会超时
    testTimeout: 30000,
  },
});
