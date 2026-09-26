// What a member's standup looks like on the wire. Blank rows are dropped: a
// row is a place to type, not a statement that the answer was empty.
export function buildUserStandupPayload(state, channelID) {
    const standup = {};

    for (const sectionTitle of Object.keys(state.standup)) {
        standup[sectionTitle] = Object.values(state.standup[sectionTitle]).
            map((line) => line.trim()).
            filter((line) => line !== '');
    }

    return {
        channelId: channelID,
        standup,
    };
}

export default buildUserStandupPayload;
