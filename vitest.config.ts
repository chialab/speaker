import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@chialab/speaker': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        },
    },
    test: {
        coverage: {
            provider: 'istanbul',
        },
        browser: {
            name: 'chromium',
            enabled: true,
            headless: true,
            provider: 'playwright',
        },
    },
});
