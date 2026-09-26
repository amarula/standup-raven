// Entry point for the React 19 compatibility test.
//
// It re-exports the components under test together with the React instance they
// are rendered with, so that the test drives the same copy of React the
// components use.
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

import RRule from '../src/components/rRule/rRule.jsx';
import RRuleGenerator from '../src/components/reactBootstrapRRuleGenerator';
import StartOnDate from '../src/components/reactBootstrapRRuleGenerator/components/Start/OnDate.jsx';

export {React, ReactDOMClient, RRule, RRuleGenerator, StartOnDate};
