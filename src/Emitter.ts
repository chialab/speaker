/**
 * Base event interface.
 */
export interface Event {
    data: unknown;
}

/**
 * Base emitter class.
 */
export class Emitter<EventsMap extends Record<string, Event>> {
    #listeners = {} as Record<keyof EventsMap, Function[]>;

    /**
     * Add event listener.
     * @param type Event type name.
     * @param listener Callback function.
     */
    on<T extends keyof EventsMap>(type: T, listener: (data: EventsMap[T]['data']) => unknown) {
        this.#listeners[type] = this.#listeners[type] || [];
        this.#listeners[type].push(listener);
    }

    /**
     * Remove event listener.
     * @param type Event type name.
     * @param listener Callback function.
     */
    off<T extends keyof EventsMap>(type: T, listener: Function) {
        const listeners = this.#listeners[type];
        if (!listeners) {
            return;
        }

        const index = listeners.indexOf(listener);
        if (index === -1) {
            return;
        }

        this.#listeners[type].splice(index, 1);
    }

    /**
     * Dispatch event.
     * @param type Event type name.
     * @param data Data to pass.
     */
    trigger<T extends keyof EventsMap>(type: T, data?: EventsMap[T]['data']) {
        const listeners = this.#listeners[type];
        if (!listeners) {
            return;
        }

        return listeners.reduce((result: unknown, callback) => {
            if (!listeners.includes(callback)) {
                // the callback has been removed from the callback list.
                return result;
            }
            if (result instanceof Promise) {
                // wait for the previous result.
                return result.then(() => callback.call(this, data));
            }

            return (result = callback.call(this, data));
        }, undefined);
    }
}
