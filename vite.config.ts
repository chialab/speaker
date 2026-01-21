import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [basicSsl()],
    resolve: {
        alias: {
            '@chialab/speaker': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        },
    },
    build: {
        outDir: 'public',
    },
    test: {
        coverage: {
            provider: 'istanbul',
        },
        browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [
                {
                    browser: 'chromium',
                },
            ],
        },
    },
});
