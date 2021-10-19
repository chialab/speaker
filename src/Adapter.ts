import type { SpeechToken, Utterance } from './Utterance';

export function checkSupport() {
    if (typeof window !== 'undefined' &&
        typeof window.speechSynthesis !== 'undefined' &&
        typeof window.SpeechSynthesisUtterance !== 'undefined') {
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
const VOICES_PROMISE: Promise<Array<SpeechSynthesisVoice>> = new Promise((resolve) => {
    const getVoices = () => {
        let voices = getSpeechSynthesis().getVoices();
        if (voices.length) {
            voices = [...voices].filter((voice) => voice.localService);
            resolve(voices);
            return true;
        }
        return false;
    };
    if (!getVoices()) {
        getSpeechSynthesis().onvoiceschanged = getVoices;
    }
});

export function getVoices() {
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

let rejectInterval: Function|undefined;

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
    maleVoices: [
        'Google UK English Male',
        'Daniel',
        'Diego',
        'Fred',
        'Jorge',
        'Juan',
        'Luca',
        'Thomas',
        'Xander',
    ].map(normalizeVoiceName),
};

/**
 * A Text2Speech adapter which uses native browser SpeechSynthesis.
 */
export class Adapter {
    private options: SynthesisOptions;
    private utterances?: SpeechSynthesisUtterance[];
    private utterance?: SpeechSynthesisUtterance;
    private current: number = 0;

    /**
     * Create an instance of the Synthesis adapter.
     * @param options A set of options for Synthesis.
     */
    constructor(options: Partial<SynthesisOptions> = {}) {
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
        };
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
        this.utterances?.forEach((speechUtterance) => {
            speechUtterance.onstart = null;
            speechUtterance.onresume = null;
            speechUtterance.onpause = null;
            speechUtterance.onboundary = null;
            speechUtterance.onend = null;
        });
        this.current = 0;
        delete this.utterance;
        delete this.utterances;
        speechSynthesis.pause();
        speechSynthesis.cancel();
        await awaitState(() => !speechSynthesis.pending && !speechSynthesis.speaking);
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
    async play(utterances?: Utterance[]) {
        const speechSynthesis = getSpeechSynthesis();
        if (this.utterance) {
            // just resume the playback.
            speechSynthesis.resume();
        } else if (utterances) {
            await this.cancel();

            const voices = await getVoices();
            const speechUtterances = utterances
                .map((utterance, index) => {
                    const text = utterance.getTokens().map((token) => token.text).join(' ');
                    const SpeechSynthesisUtterance = getSpeechSynthesisUtterance();
                    const speechUtterance = new SpeechSynthesisUtterance(text);
                    let boundaries = 0;
                    // setup utterance properties.
                    const voice = this.getVoice(voices, utterance.lang, utterance.voices);
                    if (!voice) {
                        return;
                    }

                    speechUtterance.voice = voice;
                    speechUtterance.lang = voice.lang;
                    speechUtterance.rate = utterance.rate;

                    // listen SpeechSynthesisUtterance events in order to trigger Utterance callbacks
                    speechUtterance.onstart = () => {
                        this.current = index;
                        this.utterance = speechUtterance;
                        utterance.started();
                    };

                    speechUtterance.onpause = async () => {
                        if (boundaries === utterance.getTokens().length) {
                            speechSynthesis.pause();
                            speechSynthesis.cancel();
                            // sometimes the browser does not dispatch end event after resume
                            // if last boundaries has been met.¯\_(ツ)_ /¯
                            this.current++;
                            delete this.utterance;
                            utterance.ended();
                        }
                    };

                    speechUtterance.onboundary = ({ charIndex }) => {
                        boundaries++;
                        utterance.boundary(utterance.getToken(charIndex) as SpeechToken);
                    };

                    speechUtterance.onend = () => {
                        if (this.paused) {
                            return;
                        }

                        this.current++;
                        delete this.utterance;
                        utterance.ended();
                        speechSynthesis.speak(speechUtterances[this.current]);
                    };

                    return speechUtterance;
                })
                .filter(Boolean) as SpeechSynthesisUtterance[];

            // store utterances queue.
            this.utterances = speechUtterances;
            speechSynthesis.speak(speechUtterances[this.current]);
        } else if (this.utterances) {
            speechSynthesis.speak(this.utterances[this.current]);
        }

        await awaitState(() => speechSynthesis.speaking && !speechSynthesis.paused);
    }

    /**
     * Get a voice for the requested language.
     * @param voices A list of available voices.
     * @param requestedLang The requested language.
     * @param requestedVoices The requested voices.
     */
    private getVoice(voices: SpeechSynthesisVoice[], requestedLang: string, requestedVoices: string[]) {
        const { preferredVoices, maleVoices, femaleVoices } = this.options;

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
            const voice = requestedVoices
                .reduce((voice: SpeechSynthesisVoice | null, voiceType: string): SpeechSynthesisVoice | null => {
                    voiceType = normalizeVoiceName(voiceType);

                    if (voice) {
                        return voice;
                    }
                    if (voiceType === 'male') {
                        return availableVoices.find((voice) =>
                            maleVoices.includes(normalizeVoiceName(voice.name))
                        ) || null;
                    }
                    if (voiceType === 'female') {
                        return availableVoices.find((voice) =>
                            femaleVoices.includes(normalizeVoiceName(voice.name))
                        ) || null;
                    }

                    return availableVoices.find((voice) =>
                        normalizeVoiceName(voice.name) === voiceType
                    ) || null;
                }, null);
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
    canSpeech(token: Element) {
        return !token.closest('math, [data-mathml]');
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
