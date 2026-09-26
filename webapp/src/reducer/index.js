import {combineReducers} from 'redux';
import {standupModalChannelId, standupModalVisible} from './standupModalReducer';
import {configModalVisible} from './configModalReducer';
import {addedActiveChannel, removedActiveChannel} from './activeChannel';

export default combineReducers({
    standupModalVisible,
    standupModalChannelId,
    configModalVisible,
    addedActiveChannel,
    removedActiveChannel,
});
