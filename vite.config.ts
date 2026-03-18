import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
      cli: 'cli/index.ts',
    },
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
