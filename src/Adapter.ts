import { Deferred } from './Deferred';
import type { BoundaryToken } from './Tokenizer';
import type { Utterance } from './Utterance';

export function checkSupport() {
    if (
        typeof window !== 'undefined' &&
        typeof window.speechSynthesis !== 'undefined' &&
        typeof window.SpeechSynthesisUtterance !== 'undefined'
    ) {
        return true;
    }

    return false;
}

export function getSpeechSynthesis() {
    /* global window */
    if (checkSupport()) {
        return window.speechSynthesis;
    }

    throw new Error('missing support for SpeechSynthesis');
}

export function getSpeechSynthesisUtterance() {
    /* global window */
    if (checkSupport()) {
        return window.SpeechSynthesisUtterance;
    }

    throw new Error('missing support for SpeechSynthesisUtterance');
}

/**
 * Speech synthesis voices loader is async in Chrome.
 * Promisify it.
 */
let VOICES_PROMISE: Promise<Array<SpeechSynthesisVoice>>;

/**
 * Get speech synthesis voices.
 * @param timeoutTime Timeout time in milliseconds.
 * @returns A promise that resolves voices.
 */
export function getVoices(timeoutTime: number = 2000) {
    if (!VOICES_PROMISE) {
        VOICES_PROMISE = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Cannot retrieve voices'));
            }, timeoutTime);

            const getVoices = () => {
                let voices = getSpeechSynthesis().getVoices();
                if (voices.length) {
                    clearTimeout(timeout);
                    voices = [...voices].filter((voice) => voice.localService);
                    if (!voices.length) {
                        reject(new Error('Cannot retrieve offline voices'));
                        return false;
                    }
                    resolve(voices);
                    return true;
                }
                return false;
            };
            if (!getVoices()) {
                getSpeechSynthesis().onvoiceschanged = getVoices;
            }
        });
    }
    return VOICES_PROMISE;
}

/**
 * Safari voices names prefix.
 */
const SAFARI_PREFIX = 'com.apple.speech.synthesis.voice.';

/**
 * Normalize voices names.
 * @param name The browser voice name.
 * @return The normalized value.
 */
function normalizeVoiceName(name: string) {
    return name.toLowerCase().replace(SAFARI_PREFIX, '');
}

let rejectInterval: Function | undefined;

/**
 * SpeechSynthesis API are not deterministic.
 * Use this function to check the state of the service.
 * @param callback The check function.
 * @param time The interval time.
 * @return A promise tha resolves when the check function returns a thruty value.
 */
function awaitState(callback: () => boolean, time = 100): Promise<void> {
    return new Promise((resolve, reject) => {
        if (rejectInterval) {
            rejectInterval();
            rejectInterval = undefined;
        }
        if (callback()) {
            return resolve();
        }
        rejectInterval = reject;
        const interval = setInterval(() => {
            if (callback()) {
                rejectInterval = undefined;
                clearInterval(interval);
                resolve();
            }
        }, time);
    });
}

/**
 * Promisify setTimeout.
 * @param time Timeout time.
 * @returns A promise instance.
 */
function awaitTimeout(time = 100) {
    return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), time);
    });
}

export interface SynthesisOptions {
    /**
     * A list of preferred voice names to use.
     */
    preferredVoices: string[];
    /**
     * A list of female voice names to use.
     */
    femaleVoices: string[];
    /**
     * A list of male voice names to use.
     */
    maleVoices: string[];
}

/**
 * Default options for Synthesis adapter.
 */
const DEFAULT_OPTIONS: SynthesisOptions = {
    preferredVoices: [
        'Google Deutsch',
        'Google US English',
        'Google UK English Female',
        'Google español',
        'Google español de Estados Unidos',
        'Google français',
        'Google हिन्दी',
        'Google Bahasa Indonesia',
        'Google italiano',
        'Google 日本語',
        'Google 한국의',
        'Google Nederlands',
        'Google polski',
        'Google português do Brasil',
        'Google русский',
        'Google 普通话（中国大陆）',
        'Google 粤語（香港）',
        'Google 國語（臺灣）',
        'Alice',
        'Amelie',
        'Anna',
        'Ellen',
        'Fiona',
        'Joana',
        'Ioana',
        'Monica',
        'Karen',
        'Luciana',
        'Laura',
        'Milena',
        'Samantha',
        'Sara',
    ].map(normalizeVoiceName),
    femaleVoices: [
        'Google UK English Female',
        'Amelie',
        'Anna',
        'Ellen',
        'Fiona',
        'Ioana',
        'Joana',
        'Monica',
        'Karen',
        'Luciana',
        'Laura',
        'Milena',
        'Samantha',
        'Sara',
        'Tessa',
        'Victoria',
        'Zuzana',
    ].map(normalizeVoiceName),
    maleVoices: ['Google UK English Male', 'Daniel', 'Diego', 'Fred', 'Jorge', 'Juan', 'Luca', 'Thomas', 'Xander'].map(
        normalizeVoiceName
    ),
};

/**
 * A Text2Speech adapter which uses native browser SpeechSynthesis.
 */
export class Adapter {
    #options: SynthesisOptions;
    #queue: Utterance[] | null = null;
    #utterances: Map<Utterance, SpeechSynthesisUtterance> = new Map();
    #playbackDeferred: Deferred | null = null;
    #current: Utterance | null = null;
    #cancelable = false;

    /**
     * Create an instance of the Synthesis adapter.
     * @param options A set of options for Synthesis.
     */
    constructor(options: Partial<SynthesisOptions> = {}) {
        this.#options = {
            ...DEFAULT_OPTIONS,
            ...options,
        };
    }

    /**
     * Flag for active speech.
     */
    get active() {
        return !!this.#playbackDeferred;
    }

    /**
     * Get the pause state of the adapter.
     */
    get paused() {
        return getSpeechSynthesis().paused;
    }

    /**
     * Cancel the current speaking.
     */
    async cancel(): Promise<void> {
        const speechSynthesis = getSpeechSynthesis();
        this.#queue?.forEach((utterance) => {
            const speechUtterance = this.#utterances.get(utterance);
            if (speechUtterance) {
                speechUtterance.onstart = null;
                speechUtterance.onboundary = null;
                speechUtterance.onend = null;
            }
        });
        this.#current = null;
        this.#queue = null;
        this.#utterances.clear();
        speechSynthesis.pause();
        speechSynthesis.cancel();
        await awaitState(() => !speechSynthesis.pending && !speechSynthesis.speaking);
        if (this.#playbackDeferred) {
            this.#playbackDeferred.reject(new Error('Canceled'));
        }
        this.#playbackDeferred = null;
    }

    /**
     * Pause the current speaking.
     */
    async pause() {
        const speechSynthesis = getSpeechSynthesis();
        speechSynthesis.pause();
        await awaitState(() => speechSynthesis.paused);
    }

    /**
     * Start or resume a speaking.
     * @param utterances A list of utterances to speak.
     */
    async play(utterances?: Utterance[]): Promise<Deferred> {
        const speechSynthesis = getSpeechSynthesis();
        if (!utterances && this.#queue) {
            const deferred = this.#playbackDeferred as Deferred;
            if (this.#current) {
                const utterance = this.#current;
                if (utterance.current === utterance.getLastToken()) {
                    this.#cancelable = false;
                    // sometimes the browser does not dispatch end event after resume
                    // if last boundaries has been met.¯\_(ツ)_/¯
                    speechSynthesis.pause();
                    speechSynthesis.cancel();
                    this.onUtteranceEnd(utterance, this.#queue);
                    this.#cancelable = true;
                } else {
                    // just resume the playback.
                    speechSynthesis.resume();
                }
            }

            return deferred;
        }

        this.#cancelable = false;

        if (this.active) {
            await this.cancel();
        } else {
            speechSynthesis.pause();
            speechSynthesis.cancel();
            await Promise.all([
                awaitState(() => !speechSynthesis.pending && !speechSynthesis.speaking),
                // sometime speechSynthesis claims its state is clean, but it is not
                awaitTimeout(),
            ]);
        }

        this.#cancelable = true;

        const deferred = (this.#playbackDeferred = new Deferred());
        const voices = await getVoices();
        const queue = (this.#queue = utterances || []);
        queue.forEach((utterance) => {
            const SpeechSynthesisUtterance = getSpeechSynthesisUtterance();
            const speechUtterance = new SpeechSynthesisUtterance(utterance.getText());
            // setup utterance properties
            const voice = this.getVoice(voices, utterance.lang, utterance.voices.split(','));
            if (!voice) {
                return;
            }

            speechUtterance.voice = voice;
            speechUtterance.lang = voice.lang;
            speechUtterance.rate = utterance.rate;

            // listen SpeechSynthesisUtterance events in order to trigger Utterance callbacks
            speechUtterance.onstart = () => this.onUtteranceStart(utterance, queue);
            speechUtterance.onboundary = (event: SpeechSynthesisEvent) =>
                this.onUtteranceBoundary(utterance, event.charIndex);
            speechUtterance.onend = () => this.onUtteranceEnd(utterance, queue);
            this.#utterances.set(utterance, speechUtterance);

            return speechUtterance;
        });

        if (!queue.length) {
            deferred.resolve();
            return deferred;
        }

        speechSynthesis.speak(this.#utterances.get(queue[0] as Utterance) as SpeechSynthesisUtterance);
        if (speechSynthesis.paused) {
            speechSynthesis.resume();
        }

        await awaitState(() => speechSynthesis.speaking && !speechSynthesis.paused);

        return deferred;
    }

    /**
     * Utterance started hook.
     * @param utterance The started utterance.
     * @param queue The list of uttereances queued.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async onUtteranceStart(utterance: Utterance, queue: Utterance[]) {
        this.#current = utterance;
        await utterance.start();
    }

    /**
     * Utterance boundary hook.
     * @param utterance The started utterance.
     * @param charIndex The char index boundary.
     */
    private async onUtteranceBoundary(utterance: Utterance, charIndex: number) {
        await utterance.boundary(utterance.getToken(charIndex) as BoundaryToken);
    }

    /**
     * Utterance ended hook.
     * @param utterance The ended utterance.
     * @param queue The list of uttereances queued.
     */
    private async onUtteranceEnd(utterance: Utterance, queue: Utterance[]) {
        if (utterance.ended) {
            return;
        }
        if (this.paused && this.#cancelable) {
            return this.cancel();
        }

        this.#current = null;
        await utterance.end();

        const index = queue.indexOf(utterance);
        if (index < queue.length - 1) {
            const speechUtterance = this.#utterances.get(queue[index + 1]);
            if (speechUtterance) {
                speechSynthesis.speak(speechUtterance);
                if (speechSynthesis.paused) {
                    speechSynthesis.resume();
                }
            }
            return;
        }

        this.#playbackDeferred?.resolve();
        this.#playbackDeferred = null;
    }

    /**
     * Get a voice for the requested language.
     * @param voices A list of available voices.
     * @param requestedLang The requested language.
     * @param requestedVoices The requested voices.
     */
    private getVoice(voices: SpeechSynthesisVoice[], requestedLang: string, requestedVoices: string[]) {
        const { preferredVoices, maleVoices, femaleVoices } = this.#options;

        requestedLang = requestedLang.toLowerCase().replace('_', '-');
        const availableVoices = voices.filter((voice) => {
            const voiceLang = voice.lang.toLowerCase().replace('_', '-');
            const shortVoiceLang = voiceLang.split('-')[0];
            return voiceLang === requestedLang || shortVoiceLang === requestedLang;
        });

        if (!availableVoices.length) {
            return null;
        }

        if (requestedVoices.length) {
            const voice = requestedVoices.reduce(
                (voice: SpeechSynthesisVoice | null, voiceType: string): SpeechSynthesisVoice | null => {
                    voiceType = normalizeVoiceName(voiceType);

                    if (voice) {
                        return voice;
                    }
                    if (voiceType === 'male') {
                        return (
                            availableVoices.find((voice) => maleVoices.includes(normalizeVoiceName(voice.name))) || null
                        );
                    }
                    if (voiceType === 'female') {
                        return (
                            availableVoices.find((voice) => femaleVoices.includes(normalizeVoiceName(voice.name))) ||
                            null
                        );
                    }

                    return availableVoices.find((voice) => normalizeVoiceName(voice.name) === voiceType) || null;
                },
                null
            );
            if (voice) {
                return voice;
            }
        }

        const preferredAvailableVoices = availableVoices.filter((voice) =>
            preferredVoices.includes(normalizeVoiceName(voice.name))
        );
        if (preferredAvailableVoices.length) {
            return preferredAvailableVoices[0];
        }

        return availableVoices[0];
    }

    /**
     * Check if a token can be spoken by the adapter.
     * @param token The token to check.
     */
    canSpeech(token: BoundaryToken) {
        return !token.startNode.parentElement?.closest('math, [data-mathml]');
    }
}

try {
    const speechSynthesis = getSpeechSynthesis();
    // ensure that speech synthesis is stop on page load.
    speechSynthesis.pause();
    speechSynthesis.cancel();

    // ensure that speech will stop on page unload.
    window.addEventListener('beforeunload', () => {
        speechSynthesis.pause();
        speechSynthesis.cancel();
    });
} catch {
    //
}
