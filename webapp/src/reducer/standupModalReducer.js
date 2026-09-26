import Constants from '../constants';

let prevState;

// The modal normally works on the channel the user is looking at, but a click on
// a standup prompt has to open the channel that prompt belongs to, wherever the
// user happens to be. This holds that channel for as long as the modal is open.
export const standupModalChannelId = (state = '', action) => {
    switch (action.type) {
        case Constants.ACTIONS.OPEN_STANDUP_MODAL:
            return action.channelId || '';
        case Constants.ACTIONS.CLOSE_STANDUP_MODAL:
            return '';
        default:
            return state;
    }
};

export const standupModalVisible = (state = false, action) => {
    switch (action.type) {
        case Constants.ACTIONS.OPEN_STANDUP_MODAL:
            prevState = true;
            return true;
        case Constants.ACTIONS.CLOSE_STANDUP_MODAL:
            prevState = false;
            return false;
        default:
            return prevState || false;
    }
};
