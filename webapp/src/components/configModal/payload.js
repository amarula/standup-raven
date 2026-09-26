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
