import { Deferred } from './Deferred';
import type { BoundaryToken } from './Tokenizer';
import type { Utterance } from './Utterance';
import * as voicesLoader from './voices/index';

export function checkSupport(): boolean {
    if (
        typeof window !== 'undefined' &&
        typeof window.speechSynthesis !== 'undefined' &&
        typeof window.SpeechSynthesisUtterance !== 'undefined'
    ) {
        return true;
    }

    return false;
}

export function getSpeechSynthesis(): SpeechSynthesis {
    /* global window */
    if (checkSupport()) {
        return window.speechSynthesis;
    }

    throw new Error('missing support for SpeechSynthesis');
}

export function getSpeechSynthesisUtterance(): typeof SpeechSynthesisUtterance {
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
let VOICES_PROMISE: Promise<SpeechSynthesisVoice[]>;

/**
 * Get speech synthesis voices.
 * @param timeoutTime Timeout time in milliseconds.
 * @returns A promise that resolves voices.
 */
export function getVoices(timeoutTime = 2000): Promise<SpeechSynthesisVoice[]> {
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

let rejectInterval: (() => void) | undefined;

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

/**
 * A Text2Speech adapter which uses native browser SpeechSynthesis.
 */
export class Adapter {
    #queue: Utterance[] | null = null;
    #utterances: Map<Utterance, SpeechSynthesisUtterance> = new Map();
    #playbackDeferred: Deferred | null = null;
    #current: Utterance | null = null;
    #cancelable = false;

    /**
     * Flag for active speech.
     */
    get active(): boolean {
        return !!this.#playbackDeferred;
    }

    /**
     * Get the pause state of the adapter.
     */
    get paused(): boolean {
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
    async pause(): Promise<void> {
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

        const deferred = new Deferred();
        this.#playbackDeferred = deferred;
        const voices = await getVoices();
        const queue = utterances || [];
        this.#queue = queue;
        for (const utterance of queue) {
            const SpeechSynthesisUtterance = getSpeechSynthesisUtterance();
            const speechUtterance = new SpeechSynthesisUtterance(utterance.getText());
            // setup utterance properties
            const voice = await this.getVoice(
                voices,
                utterance.lang,
                utterance.voiceType,
                utterance.voices?.split(',')
            );
            if (!voice) {
                continue;
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
        }

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
    private async getVoice(
        voices: SpeechSynthesisVoice[],
        requestedLang: string,
        requestedVoiceType?: string | null,
        requestedVoices?: string[] | null
    ) {
        const normalizedLang = requestedLang.toLowerCase().replace('_', '-');
        const availableVoices = voices.filter((voice) => {
            const voiceLang = voice.lang.toLowerCase().replace('_', '-');
            const shortVoiceLang = voiceLang.split('-')[0];
            return voiceLang === normalizedLang || shortVoiceLang === normalizedLang;
        });

        if (!availableVoices.length) {
            return null;
        }

        if (requestedVoices?.length) {
            const voice = availableVoices.find((voice) => requestedVoices.includes(voice.name));
            if (voice) {
                return voice;
            }
        }

        const shortLang = normalizedLang.split('-')[0];
        if (shortLang in voicesLoader) {
            const knownVoices = (await voicesLoader[shortLang as 'en']()).sort((a, b) => b.quality - a.quality);
            const knownVoice = knownVoices.find(
                (v) =>
                    (requestedVoiceType ? v.type === requestedVoiceType : true) &&
                    availableVoices.some((voice) => voice.name === v.name)
            );
            if (knownVoice) {
                return availableVoices.find((voice) => voice.name === knownVoice.name);
            }
        }

        return availableVoices[0];
    }

    /**
     * Check if a token can be spoken by the adapter.
     * @param token The token to check.
     */
    canSpeech(token: BoundaryToken): boolean {
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
