# Speaker

A text2speech implementation for HTML documents.

[![NPM](https://img.shields.io/npm/v/@chialab/speaker.svg?style=flat-square)](https://www.npmjs.com/package/@chialab/speaker)
[![License](https://img.shields.io/npm/l/@chialab/speaker.svg?style=flat-square)](https://github.com/chialab/speaker/blob/master/LICENSE)

---

## Get the library

Usage via [unpkg.com](https://unpkg.com/), as UMD package:

```html
<script src="https://unpkg.com/@chialab/speaker" type="text/javascript"></script>
```

or as ES6 module:

```js
import { Speaker } from 'https://unpkg.com/@chialab/speaker?module';
```

Install via NPM:

```sh
$ npm i @chialab/speaker # NPM
$ yarn add @chialab/speaker # Yarn
```

```ts
import { Speaker } from '@chialab/speaker';
```

---

## Development

### Requirements

In order to build and test Synapse, the following requirements are needed:
* [NodeJS](https://nodejs.org/) (>= 10.0.0)
* [Yarn](https://yarnpkg.com)
* [RNA](https://github.com/chialab/rna-cli) (>= 3.0.0)

### Build the project

Install the dependencies and run the `build` script:
```
$ yarn install
$ yarn build
```

This will generate the UMD and ESM bundles in the `dist` folder and declaration files in the `types` folder.

---

## License

Speaker is released under the [MIT](https://github.com/chialab/speaker/blob/master/LICENSE) license.
