import Constants from '../../constants';

// The kinds of answer a section asks for, keyed by the section's title, because
// that is what the server stores them against. Plain text is left out: it is
// what a section with no type recorded means, so sending it would only be noise.
function sectionTypesFor(state) {
    const types = {};

    Object.keys(state.sections).forEach((name) => {
        const title = (state.sections[name] || '').trim();
        const sectionType = state.sectionTypes ? state.sectionTypes[name] : undefined;

        if (!title || !sectionType || sectionType === Constants.SECTION_TYPES.TEXT) {
            return;
        }

        types[title] = sectionType;
    });

    return types;
}

// The body the server expects when a standup configuration is saved.
//
// It is a pure function of the modal's state and the channel it was opened for,
// which is the point: the wire format can be asserted without mounting the
// modal, and a change to the UI cannot quietly change what is sent. The key
// order is the one the server has always received.
export function buildStandupConfigPayload(state, channelID) {
    return {
        channelId: channelID,
        windowOpenTime: state.windowOpenTime,
        windowCloseTime: state.windowCloseTime,
        reportFormat: state.reportFormat,
        sections: Object.values(state.sections).map((section) => section.trim()).filter((section) => section !== ''),
        sectionTypes: sectionTypesFor(state),
        members: state.members,
        enabled: state.enabled,
        timezone: state.timezone,
        windowCloseReminderEnabled: state.windowCloseReminderEnabled,
        windowOpenReminderEnabled: state.windowOpenReminderEnabled,
        scheduleEnabled: state.scheduleEnabled,
        rruleString: state.rruleString,
        startDate: state.startDate,
    };
}

export default buildStandupConfigPayload;
