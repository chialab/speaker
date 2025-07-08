import { glob, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL(import.meta.url));
const root = resolve(scriptPath, '../..');
const voicesPath = resolve(root, 'src/voices');
const webSpeechRecommendedVoicesPath = resolve(
    fileURLToPath(import.meta.resolve('web-speech-recommended-voices/README.md')),
    '../json'
);

await rm(voicesPath, { recursive: true, force: true });
await mkdir(voicesPath, { recursive: true });

const jsonFiles = glob(join(webSpeechRecommendedVoicesPath, '*.json'));
const languages = [];
for await (const jsonFile of jsonFiles) {
    const data = JSON.parse(await readFile(jsonFile, 'utf-8'));
    const voices = data.voices
        .filter((voice) => voice.preloaded)
        .map((voice) => ({
            name: voice.name,
            lang: voice.language,
            type: voice.gender || null,
            quality: voice.quality.includes('veryHigh')
                ? 4
                : voice.quality.includes('high')
                  ? 3
                  : voice.quality.includes('normal')
                    ? 2
                    : 1,
        }));

    languages.push(data.language);
    await writeFile(join(voicesPath, `${data.language}.ts`), `export default ${JSON.stringify(voices, null, 4)}\n`);
}

await writeFile(
    join(voicesPath, 'index.ts'),
    `${languages.map((lang) => `export const ${lang} = () => import('./${lang}');`).join('\n')}\n`
);
