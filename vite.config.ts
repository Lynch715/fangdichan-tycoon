import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对路径，方便部署到 GitHub Pages 的子目录
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
