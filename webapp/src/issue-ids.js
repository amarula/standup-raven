// YouTrack-style issue IDs: an uppercase project key, a hyphen, a number.
//
// The server normalises the same way before storing, so what this accepts is
// what ends up saved. Nothing here rejects anything — a typo is worth showing
// back to the person who made it, not worth refusing their standup over.
const ISSUE_ID = /^[A-Z][A-Z0-9]*-\d+$/;

// Commas, spaces and newlines all separate, so "AXELERA-210, AXELERA-183" and
// "AXELERA-210 AXELERA-183" mean the same thing.
export function splitIssueIDs(text) {
    return String(text === null || text === undefined ? '' : text).
        split(/[\s,]+/).
        map((part) => part.trim()).
        filter(Boolean);
}

// The IDs worth storing: uppercased, deduplicated, in a stable order.
export function parseIssueIDs(text) {
    const seen = {};
    const ids = [];

    splitIssueIDs(text).forEach((part) => {
        const id = part.toUpperCase();

        if (!ISSUE_ID.test(id) || seen[id]) {
            return;
        }

        seen[id] = true;
        ids.push(id);
    });

    return ids.sort();
}

// What did not look like an ID, as typed, so the message can quote it back.
export function invalidIssueIDs(text) {
    return splitIssueIDs(text).filter((part) => !ISSUE_ID.test(part.toUpperCase()));
}

export default {parseIssueIDs, invalidIssueIDs};
