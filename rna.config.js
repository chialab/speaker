/**
 * @type {import('@chialab/rna-config-loader').ProjectConfig}
 */
const config = {
    entrypoints: [
        {
            input: 'src/index.ts',
            output: 'dist/esm/speaker.js',
            format: 'esm',
            platform: 'browser',
        },
        {
            input: 'src/index.ts',
            output: 'dist/cjs/speaker.cjs',
            format: 'cjs',
            platform: 'browser',
        },
    ],
    bundle: true,
    minify: true,
};

export default config;
