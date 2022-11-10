export class Deferred<T = void> {
    #promise: Promise<T>;
    #resolve: (value: T) => void = () => {};
    #reject: (reason: Error) => void = () => {};

    constructor() {
        this.#promise = new Promise<T>((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });
    }

    promise() {
        return this.#promise;
    }

    resolve(value: T) {
        this.#resolve(value);
    }

    reject(reason: Error) {
        this.#reject(reason);
    }
}
