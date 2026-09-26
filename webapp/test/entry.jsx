// Entry point for the React 19 compatibility test.
//
// It re-exports the components under test together with the React instance they
// are rendered with, so that the test drives the same copy of React the
// components use.
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

import RRule from '../src/components/rRule/rRule.jsx';
import {buildRRuleString, parseRRuleString, DEFAULT_EDITOR_STATE} from '../src/components/rRule/codec';
import {standupModalChannelId} from '../src/reducer/standupModalReducer';
import Selectors from '../src/selectors';
import Constants from '../src/constants';
import * as UI from '../src/components/ui';
import ConfigModal from '../src/components/configModal/configModal.jsx';
import {buildStandupConfigPayload} from '../src/components/configModal/payload';
import StandupModal from '../src/components/standupModal/standupModal.jsx';
import {buildUserStandupPayload} from '../src/components/standupModal/payload';
import TimePicker from '../src/components/timePicker/timePicker.jsx';

export {
    React,
    ReactDOMClient,
    RRule,
    buildRRuleString,
    parseRRuleString,
    DEFAULT_EDITOR_STATE,
    standupModalChannelId,
    Selectors,
    Constants,
    UI,
    ConfigModal,
    buildStandupConfigPayload,
    StandupModal,
    buildUserStandupPayload,
    TimePicker,
};
