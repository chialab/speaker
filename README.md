# Speaker

**A text2speech implementation for HTML documents.**

[![NPM](https://img.shields.io/npm/v/@chialab/speaker.svg)](https://www.npmjs.com/package/@chialab/speaker)

---

## Get the library

Install via NPM or Yarn:

```
npm i @chialab/speaker
```

```
yarn add @chialab/speaker
```

## Usage

### Initialize

```js
import { Speaker } from '@chialab/speaker';

const article = document.querySelector('article');
const speaker = new Speaker(article);
```

### Playback

```js
speaker.play();  // Play or resume playback
speaker.pause(); // Pause
speaker.stop();  // Stop
```

### Highlight

Highlight the active sentence and/or word:

```js
speaker.setupHighlighter({
    boundaries: true,
    sentences: true,
});
```

> [!WARNING]  
> The client must support [CSS Highlights API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) to enable highlighting. ([caniuse.com](https://caniuse.com/mdn-api_highlight))

---

## Development

[![Build status](https://github.com/chialab/speaker/workflows/Main/badge.svg)](https://github.com/chialab/speaker/actions?query=workflow%3ABuild)
[![codecov](https://codecov.io/gh/chialab/speaker/branch/main/graph/badge.svg)](https://codecov.io/gh/chialab/speaker)

### Build

Install the dependencies

```
yarn
```

and run the `build` script:

```
yarn build
```

This will generate the ESM and CJS bundles in the `dist` folder and declaration files in the `types` folder.

---

## License

**Speaker** is released under the [MIT](https://github.com/chialab/speaker/blob/main/LICENSE) license.
