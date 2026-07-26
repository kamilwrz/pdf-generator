/**
 * Serializes document writes so an older request can never finish after and
 * overwrite a newer edit on the server.
 */
export function createSerialSaveQueue(onPendingChange = () => {}) {
    let chain = Promise.resolve();
    let pending = 0;

    const notify = () => onPendingChange(pending);

    return {
        enqueue(task) {
            pending += 1;
            notify();

            const next = chain
                .catch(() => undefined)
                .then(task);
            chain = next;

            return next.finally(() => {
                pending -= 1;
                notify();
            });
        },
        whenIdle() {
            return chain.catch(() => undefined);
        },
    };
}
