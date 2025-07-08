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

    /**
     * Get the promise instance.
     * @returns A Promise instance.
     */
    promise(): Promise<T> {
        return this.#promise;
    }

    /**
     * Resolve the promise.
     * @param value The resolution value of the promise.
     */
    resolve(value: T): void {
        this.#resolve(value);
    }

    /**
     * Reject the promise.
     * @param reason The error causing the rejection.
     */
    reject(reason: Error): void {
        this.#reject(reason);
    }
}
