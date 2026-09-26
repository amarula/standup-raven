import Constants from '../constants';

const getPluginState = (state) => state[`plugins-${Constants.PLUGIN_NAME}`] || {};

export const isStandupModalVisible = (state) => getPluginState(state).standupModalVisible || false;

// The channel the standup modal should act on: the one a prompt asked for when
// it opened the modal, otherwise the channel the user is looking at.
export const standupModalChannel = (state) => {
    const promptedChannel = getPluginState(state).standupModalChannelId;
    if (promptedChannel) {
        return promptedChannel;
    }

    if (state.entities && state.entities.channels) {
        return state.entities.channels.currentChannelId || '';
    }

    return '';
};

export const isConfigModalVisible = (state) => getPluginState(state).configModalVisible || false;

export const addedActiveChannel = (state) => getPluginState(state).addedActiveChannel || '';

export const removedActiveChannel = (state) => getPluginState(state).removedActiveChannel || '';

export default {
    isStandupModalVisible,
    isConfigModalVisible,
    standupModalChannel,
    addedActiveChannel,
    removedActiveChannel,
};
