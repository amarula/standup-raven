// A stand-in for superagent. It records every request the modals make and
// answers from a queue the test fills, so the modals can be driven end to end -
// open, edit, save - without a server, and so what they send can be asserted
// character for character.

const requests = [];
const queued = [];

function answer() {
    return queued.shift() || {ok: true, status: 200, body: {}};
}

function makeRequest(method, url) {
    const call = {method, url, headers: {}, body: undefined};
    requests.push(call);

    const chain = {
        withCredentials() {
            return chain;
        },
        set(name, value) {
            call.headers[name] = value;
            return chain;
        },
        send(body) {
            call.body = body;
            return chain;
        },
        end(callback) {
            const response = answer();
            if (callback) {
                callback(response.error || null, response);
            }
            return chain;
        },
        // superagent's request is thenable, which is how the client library
        // awaits it.
        then(onFulfilled, onRejected) {
            return Promise.resolve(answer()).then(onFulfilled, onRejected);
        },
    };

    return chain;
}

const stub = {
    get: (url) => makeRequest('get', url),
    post: (url) => makeRequest('post', url),
    queue: (response) => queued.push(response),
    requests,
    reset: () => {
        requests.length = 0;
        queued.length = 0;
    },
};

// The test bundles this file, so the test's own require() would get a second,
// unrelated copy. Through a global it is the same object the bundle uses.
global.__superagentStub = stub;

module.exports = stub;
