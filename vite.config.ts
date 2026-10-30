import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/** Publish the latest satellite snapshot as a plain file, so open pages can pick up newer data from this site. */
function publishSnapshot() {
  return {
    name: 'skyground-publish-snapshot',
    generateBundle(this: { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'data/gp-catalog.json', source: readFileSync('data/snapshots/gp-catalog.json', 'utf8') });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [publishSnapshot()],
  build: {
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
