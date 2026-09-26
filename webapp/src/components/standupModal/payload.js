import Constants from '../../constants';
import {parseIssueIDs} from '../../issue-ids';

// What a member's standup looks like on the wire, which depends on what kind of
// answer each section asked for:
//
//   * a question answered in lines drops the blank ones, because a row is a
//     place to type rather than a statement that the answer was empty;
//   * work notes are stored as one value, newlines and all, because dropping
//     blank lines inside them would take the blank lines out of a code block;
//   * issue IDs are stored one per entry, uppercased and deduplicated.
export function buildUserStandupPayload(state, channelID, sectionTypes) {
    const standup = {};
    const types = sectionTypes || {};

    Object.keys(state.standup).forEach((sectionTitle) => {
        const lines = Object.values(state.standup[sectionTitle]);
        const sectionType = types[sectionTitle] || Constants.SECTION_TYPES.TEXT;

        if (sectionType === Constants.SECTION_TYPES.LONG_TEXT) {
            const notes = lines.join('\n').trim();
            standup[sectionTitle] = notes === '' ? [] : [notes];
            return;
        }

        if (sectionType === Constants.SECTION_TYPES.ISSUES) {
            standup[sectionTitle] = parseIssueIDs(lines.join(', '));
            return;
        }

        standup[sectionTitle] = lines.map((line) => line.trim()).filter((line) => line !== '');
    });

    return {
        channelId: channelID,
        standup,
    };
}

export default buildUserStandupPayload;
