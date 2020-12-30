import { Factory, merge } from '@chialab/proteins';
import { chunk } from '@chialab/text-helpers';
import { SpeechToken, Utterance } from './Utterance';
import { Adapter } from './Adapter';

export interface SpeechOptions {
    /**
     * The initial playback rate for the speaking.
     */
    rate: number;
    /**
     * The default language.
     */
    lang: string;
    /**
     * The class for the active token.
     */
    tokenActive: string;
    /**
     * The class for the active sentence.
     */
    sentenceActive: string;
    /**
     * A selector string for tokens that have to be spoken.
     */
    tokenSelector: string;
    /**
     * A selector string for sentences that have to be spoken.
     */
    sentenceSelector: string;
    /**
     * A selector string for tokens to ignore.
     */
    ignoreSelector: string;
    /**
     * A list of attributes which replaces token contents when spoken.
     */
    ariaAttributes: string[];
    /**
     * A set of options for the chunk method.
     * @see @chialab/text-helpers.
     */
    chunk: Object;
}

/**
 * Default options.
 */
const DEFAULT_OPTIONS: SpeechOptions = {
    rate: 1,
    lang: document.documentElement.lang || navigator.language || 'en-US',
    tokenActive: 'speaker--word-active',
    sentenceActive: 'speaker--sentence-active',
    tokenSelector: '.tagger--speaking, [aria-label], [alt], math, [data-mathml]',
    sentenceSelector: '.tagger--sentence',
    ignoreSelector: '[aria-hidden]',
    ariaAttributes: ['aria-label', 'alt', 'data-mathml'],
    chunk: {
        useClasses: true,
        modes: ['speaking', 'sentence'],
        tokenSpeaking: 'tagger--speaking',
        tokenSentence: 'tagger--sentence',
    },
};

/**
 * A Text2Speech library which highlights words when an utterance is speaking.
 * It uses adapters for multiple implementations like native browser speech synthesis or ReadSpeaker.
 * It also uses the chunk method from the @chialab/text-helpers module for tokenization of the document.
 */
export class Speaker extends Factory.Emitter {
    rate: number;
    lang: string;
    private element: HTMLElement;
    private adapter: Adapter;
    private options: SpeechOptions;

    /**
     * Create a Speaker instance.
     * @param root The root element of the document to speak.
     * @param options A set of options for the library.
     */
    constructor(root: HTMLElement, options: Partial<SpeechOptions> = {}) {
        super();

        this.element = root;
        this.adapter = new Adapter();
        this.options = merge(DEFAULT_OPTIONS, options);
        this.rate = this.options.rate;
        this.lang = this.options.lang;

        let { chunk: chunkOptions } = this.options;
        if (chunkOptions) {
            chunk(root, chunkOptions);
        }

        // handle sync on boundary.
        this.on('boundary', this.onBoundary.bind(this));
        // clean up highlights on cancelation or end.
        this.on('end', this.clear.bind(this));
        this.on('cancel', this.clear.bind(this));
    }

    /**
     * Flag for active speech.
     */
    get active() {
        return !!this.queue;
    }

    /**
     * Flag for paused speech.
     */
    get paused() {
        return this.adapter.paused;
    }

    /**
     * Cancel the current speech.
     */
    async cancel() {
        if (!this.active) {
            throw 'missing active speech';
        }
        await this.adapter.cancel();
        return await this.trigger('cancel');
    }

    /**
     * Start or resume a speech.
     * @param range A selection range of tokens to speech.
     */
    async play(range?: Range) {
        let active = this.active;
        let paused = this.paused;
        this.range = range;
        if (active) {
            if (!paused) {
                return;
            }

            let data = await this.adapter.play();
            return await this.trigger('play', data);
        }
        if (this.active) {
            await this.adapter.cancel();
        }

        let tokens = this.findTokens(range);
        if (!tokens.length) {
            await this.trigger('play');
            setTimeout(() => {
                this.trigger('end');
            });
            return;
        }

        let queue = this.createQueue(tokens);
        this.queue = queue;
        this.syncQueue(queue);
        await this.trigger('loading');
        const data = await this.adapter.play(queue);
        await this.trigger('play', data);
    }

    /**
     * Pause a speech.
     */
    async pause() {
        if (!this.active) {
            throw 'missing active speech';
        }
        await this.adapter.pause();
        return await this.trigger('pause');
    }

    /**
     * Set rate. Stop and play again if running.
     * @param rate The rate value to set.
     */
    async setRate(rate: number) {
        this.rate = rate;

        let active = this.active;
        let paused = this.paused;
        let range = this.range;
        let cancelPromise = Promise.resolve();
        if (active) {
            cancelPromise = this.adapter.cancel();
            this.clear();
        }

        await cancelPromise;

        if (active && !paused) {
            // restart the playback with the new rate.
            await this.play(range);
        }
    }

    /**
     * Find speech tokens in the document.
     * @param range A selection range of tokens to speech.
     * @return A list of tokens.
     */
    private findTokens(range?: Range) {
        let { tokenSelector, ignoreSelector } = this.options;

        let tokens: Element[] = [];
        if (!range) {
            tokens = Array.from(this.element.querySelectorAll(tokenSelector));
        } else {
            tokens = Array.from((range.commonAncestorContainer as HTMLElement).querySelectorAll(tokenSelector))
                .filter((token) => range.intersectsNode(token));
        }

        // remove tokens that are child of another token
        tokens = tokens.filter((token) => {
            let parent = token.parentNode as HTMLElement|undefined;
            let parentToken = parent?.closest(tokenSelector);
            if (!parentToken) {
                return true;
            }
            return !tokens.includes(parentToken);
        });

        if (ignoreSelector) {
            // remove ignored tokens
            tokens = tokens.filter((token) => !token.closest(ignoreSelector));
        }

        // remove tokens that the adapter cannot speak
        tokens = tokens.filter((token) => this.adapter.canSpeech(token));
        return tokens;
    }

    /**
     * Create a queue of utterances.
     * It groups tokens by languages and sentences in order to create a list of utterances with sync data.
     * @param words A list of word tokens for the speech.
     */
    private createQueue(words: Element[]) {
        const { sentenceSelector, ariaAttributes } = this.options;

        let currentLang: string|undefined;
        let currentVoices = '';
        let currentSentence: Element|null = null;
        let tokens: SpeechToken[] = [];
        let currentText = '';
        let queue: Utterance[] = [];

        for (let index = 0, len = words.length; index < len; index++) {
            let token = words[index];
            let sentenceElement = token.closest(sentenceSelector);
            let langElement = token.closest('[lang]');
            let language = langElement?.getAttribute('lang') || this.lang;
            let splitted = language.split(/[-_]/);
            splitted[0] = splitted[0].substring(0, 2).toLowerCase();
            if (splitted[1]) {
                splitted[1] = splitted[1].substring(0, 2).toUpperCase();
            }
            language = splitted.join('-');
            let voices = (getComputedStyle(token).getPropertyValue('--speak-voice') || '')
                .split(',')
                .map((chunk) => chunk.trim())
                .join(',');

            let text = (token as HTMLElement).innerText.trim();
            if (ariaAttributes) {
                for (let i = 0; i < ariaAttributes.length; i++) {
                    let attr = ariaAttributes[i];
                    if (token.hasAttribute(attr)) {
                        text = token.getAttribute(attr) || '';
                    }
                }
            }

            if ((!currentLang || currentLang === language) && currentVoices === voices && (!currentSentence || currentSentence === sentenceElement)) {
                let currentLength = currentText.length;
                currentLang = language;
                currentVoices = voices;
                currentSentence = sentenceElement;
                if (currentText.trim()) {
                    currentLength += 1;
                    currentText += ` ${text}`;
                } else {
                    currentText += text;
                }
                tokens.push({
                    token,
                    sentence: sentenceElement,
                    text,
                    start: currentLength,
                    end: currentText.length,
                });
            } else if (currentLang !== language || currentVoices !== voices || currentSentence !== sentenceElement) {
                let utterance = new Utterance(tokens, currentLang || this.lang, (currentVoices || '').split(','), this.rate);
                queue.push(utterance);
                currentLang = language;
                currentVoices = voices;
                currentText = text;
                currentSentence = sentenceElement;
                tokens = [{
                    token,
                    sentence: sentenceElement,
                    text,
                    start: 0,
                    end: currentText.length,
                }];
            }
            if (index === words.length - 1) {
                let utterance = new Utterance(tokens, currentLang || this.lang, (currentVoices || '').split(','), this.rate);
                queue.push(utterance);
            }
        }

        return queue;
    }

    /**
     * Listens for adapter events in order to higlight current word and sentence.
     * @param queue The queue of utterances to listen.
     */
    private syncQueue(queue: Utterance[]) {
        // handle utterance events.
        queue.forEach((utterance, index) => {
            utterance.on('boundary', (token) => {
                // a boundary had been met.
                this.trigger('boundary', token);
            });

            utterance.on('start', () => {
                // a boundary had started.
                this.trigger('boundary', utterance.getFirstToken());
            });

            if (index === queue.length - 1) {
                // when the last utterance ends, cancel the speech.
                utterance.on('end', async () => {
                    await this.adapter.cancel();
                    this.trigger('end');
                });
            }
        });
    }

    /**
     * Highlight current boundary.
     * @param token The new token.
     */
    private onBoundary(speechToken: SpeechToken) {
        if (!this.active) {
            return;
        }
        let { token, sentence } = speechToken;
        let { tokenActive, sentenceActive } = this.options;

        // highlight current token.
        this.clearStaus(token, sentence);
        this.currentSentence = sentence;
        this.currentToken = token;
        if (sentence && !this.range && !sentence.classList.contains(sentenceActive)) {
            sentence.classList.add(sentenceActive);
        }
        if (token && !token.classList.contains(tokenActive)) {
            token.classList.add(tokenActive);
        }
    }

    /**
     * Remove highlight classes.
     * @param token The new token.
     * @param sentence The new sentence.
     */
    private clearStaus(token?: Element|null, sentence?: Element|null) {
        let { tokenActive, sentenceActive } = this.options;
        let { currentToken, currentSentence } = this;

        if (currentSentence && !this.range && currentSentence !== sentence && currentSentence.classList.contains(sentenceActive)) {
            currentSentence.classList.remove(sentenceActive);
        }
        if (currentToken && currentToken !== token && currentToken.classList.contains(tokenActive)) {
            currentToken.classList.remove(tokenActive);
        }
    }

    /**
     * Clear the status of the Speaker.
     */
    private clear() {
        this.clearStaus();
        delete this.currentSentence;
        delete this.currentToken;
        delete this.queue;
        delete this.range;
    }
}
