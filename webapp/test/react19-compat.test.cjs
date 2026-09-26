// React 19 compatibility test for the plugin's recurrence UI.
//
// The web app plugins do not bundle React: they render with the host's copy, so
// this code runs on whatever React the Mattermost web app ships (React 19 from
// v12 onwards) without being rebuilt for it. React 19 removed findDOMNode,
// string refs and legacy context, all of which the date pickers this UI used
// relied on, so the components are mounted here on React 19 to catch that class
// of breakage before a server upgrade does.
//
// It is a smoke test, not a test suite: it mounts the components, drives their
// date inputs and checks the rrule they emit.
process.env.NODE_ENV = 'development';

// Pinned so that the schedules a date is written into are the same on a
// developer's machine and on the build server.
process.env.TZ = 'UTC';

const path = require('path');
const esbuild = require('esbuild');
const {JSDOM} = require('jsdom');

const failures = [];
function check(name, condition, detail) {
    if (condition) {
        console.log(`  ok   ${name}`);
    } else {
        failures.push(name);
        console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`);
    }
}

// The host provides these as globals; the plugin's webpack config points its
// externals at them. superagent is stubbed (see host-superagent.cjs) so the
// modals can be driven without a server; the rest are the real packages.
function setUpDom() {
    const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {url: 'http://localhost/'});
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.Element = dom.window.Element;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    // The web app exposes these on window, and the plugin reads them there.
    const postUtils = {
        formatText: (text) => text,
        messageHtmlToComponent: (element) => element,
    };
    global.PostUtils = postUtils;
    dom.window.PostUtils = postUtils;

    loadStylesheets(dom);
    return dom;
}

// The plugin's stylesheets end up in the page through webpack, so they have to
// be in this document too for a check about what is visible to mean anything. An
// author rule that sets `display` on an element carrying the `hidden` attribute
// wins over the user agent's own `[hidden]` rule, and an assertion that only
// looks at the attribute cannot see that.
function loadStylesheets(dom) {
    for (const file of sourceFiles('css')) {
        const style = dom.window.document.createElement('style');
        style.textContent = require('fs').readFileSync(file, 'utf8');
        dom.window.document.head.appendChild(style);
    }
}

function sourceFiles(extension) {
    const fs = require('fs');
    const walk = (dir) => fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return walk(full);
        }
        return full.endsWith(`.${extension}`) ? [full] : [];
    });
    return walk(path.join(__dirname, '../src'));
}

function setInputValue(dom, input, value) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    // React maps onChange to the input event for text-like inputs, but date
    // inputs are handled through the change event, so send both.
    input.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    input.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
}

const REACT_MAJOR = process.env.REACT_MAJOR === '18' ? '18' : '19';

async function buildBundle() {
    const outfile = path.join(__dirname, `bundle-react${REACT_MAJOR}.cjs`);
    await esbuild.build({
        entryPoints: [path.join(__dirname, 'entry.jsx')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        loader: {'.css': 'empty', '.svg': 'text', '.png': 'empty'},
        // react18/react19 and react-dom18/react-dom19 are npm aliases in
        // package.json: one installation per React major the host might be
        // running, so the same sources can be mounted on both.
        alias: {
            react: `react${REACT_MAJOR}`,
            'react-dom': `react-dom${REACT_MAJOR}`,
            'react-dom/client': `react-dom${REACT_MAJOR}/client`,
            superagent: path.join(__dirname, 'host-superagent.cjs'),
        },
        jsx: 'transform',
        logLevel: 'warning',
    });
    return outfile;
}

async function main() {
    const dom = setUpDom();
    const bundle = require(await buildBundle());
    const {React, ReactDOMClient, RRule} = bundle;
    const {act} = React;
    const {createRoot} = ReactDOMClient;

    console.log(`\nReact ${React.version} | react-dom ${require(`react-dom${REACT_MAJOR}/package.json`).version}`);

    console.log('\n[1] The APIs React 19 removed');
    {
        const findDOMNode = typeof require(`react-dom${REACT_MAJOR}`).findDOMNode;
        check(REACT_MAJOR === '19' ?
            'ReactDOM.findDOMNode is gone in React 19' :
            'ReactDOM.findDOMNode is still here in React 18, and nothing below uses it',
        REACT_MAJOR === '19' ? findDOMNode === 'undefined' : findDOMNode === 'function');
    }

    console.log('\n[2] RRule start date field (as used by the config modal)');
    {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const changes = [];

        act(() => {
            root.render(React.createElement(RRule, {
                rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15',
                startDate: '2026-09-26T00:00:00.000Z',
                onChange: (rrule, startDate) => changes.push({rrule, startDate}),
            }));
        });

        const input = container.querySelector('input[type="date"]');
        check('mounts without throwing', true);
        check('renders a date input', Boolean(input));

        if (input) {
            check('shows the local date of the ISO value it was given',
                input.value === '2026-09-26', `value was ${input.value}`);

            act(() => setInputValue(dom, input, '2026-10-05'));

            const last = changes[changes.length - 1] || {};
            check('reports an ISO timestamp for the picked date',
                last.startDate === '2026-10-05T00:00:00.000Z', `got ${last.startDate}`);
            check('leaves the rrule alone',
                typeof last.rrule === 'string' && last.rrule.startsWith('FREQ=MONTHLY'), `got ${last.rrule}`);
        }

        act(() => root.unmount());
    }

    console.log('\n[3] The recurrence editor');
    {
        const {buildRRuleString, parseRRuleString, DEFAULT_EDITOR_STATE} = bundle;
        const editor = (changes) => ({...DEFAULT_EDITOR_STATE, ...changes});

        // Every string below was produced by the vendored
        // react-bootstrap-rrule-generator this replaces, for the same choices,
        // before it was deleted. These are what the server has been storing, so
        // they are what the new editor has to keep producing.
        const golden = [
            ['weekly, the default a new channel gets', editor({}), 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'],
            ['weekly, every day', editor({weeklyDays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']}), 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR,SA,SU'],
            ['weekly, no day chosen', editor({weeklyDays: []}), 'FREQ=WEEKLY;INTERVAL=1'],
            ['weekly, weekdays every two weeks', editor({interval: 2}), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR'],
            ['weekly, one day', editor({weeklyDays: ['WE']}), 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE'],
            ['weekly, the weekend', editor({weeklyDays: ['SA', 'SU']}), 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SA,SU'],
            ['weekly, every twelve weeks', editor({interval: 12}), 'FREQ=WEEKLY;INTERVAL=12;BYDAY=MO,TU,WE,TH,FR'],
            ['monthly, on day 1', editor({frequency: 'Monthly', monthlyMode: 'on', monthlyDay: 1}), 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1'],
            ['monthly, on day 15', editor({frequency: 'Monthly', monthlyMode: 'on', monthlyDay: 15}), 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15'],
            ['monthly, on day 31', editor({frequency: 'Monthly', monthlyMode: 'on', monthlyDay: 31}), 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31'],
            ['monthly, on day 10 every three months', editor({frequency: 'Monthly', monthlyMode: 'on', monthlyDay: 10, interval: 3}), 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=10'],
            ['monthly, on the first Monday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Monday', monthlyWhich: 'First'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=1;BYDAY=MO'],
            ['monthly, on the first Wednesday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Wednesday', monthlyWhich: 'First'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=1;BYDAY=WE'],
            ['monthly, on the first Sunday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Sunday', monthlyWhich: 'First'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=1;BYDAY=SU'],
            ['monthly, on the first Day', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Day', monthlyWhich: 'First'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=1;BYDAY=MO,TU,WE,TH,FR,SA,SU'],
            ['monthly, on the first Weekday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Weekday', monthlyWhich: 'First'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=1;BYDAY=MO,TU,WE,TH,FR'],
            ['monthly, on the first Weekend day', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Weekend day', monthlyWhich: 'First'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=1;BYDAY=SA,SU'],
            ['monthly, on the Second Friday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Friday', monthlyWhich: 'Second'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=2;BYDAY=FR'],
            ['monthly, on the Third Friday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Friday', monthlyWhich: 'Third'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=3;BYDAY=FR'],
            ['monthly, on the Fourth Friday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Friday', monthlyWhich: 'Fourth'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=4;BYDAY=FR'],
            ['monthly, on the Last Friday', editor({frequency: 'Monthly', monthlyMode: 'onThe', monthlyTheDay: 'Friday', monthlyWhich: 'Last'}), 'FREQ=MONTHLY;INTERVAL=1;BYSETPOS=-1;BYDAY=FR'],
        ];

        let differences = 0;
        golden.forEach(([label, state, expected]) => {
            const got = buildRRuleString(state);
            if (got !== expected) {
                differences++;
                console.log(`       ${label}: the old editor produced ${expected}, this one produces ${got}`);
            }
        });
        check(`all ${golden.length} schedules come out exactly as the old editor wrote them`, differences === 0);

        // Reading a stored rule back has to land on the same choices, or opening
        // the modal and saving it would rewrite someone's schedule.
        let roundTrips = 0;
        golden.forEach(([label, state, expected]) => {
            const read = parseRRuleString(DEFAULT_EDITOR_STATE, expected);
            if (buildRRuleString(read) !== expected) {
                roundTrips++;
                console.log(`       ${label}: came back as ${buildRRuleString(read)}`);
            }
        });
        check('every stored schedule reads back unchanged', roundTrips === 0);

        const withEnd = parseRRuleString(DEFAULT_EDITOR_STATE, 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15;UNTIL=20261231T000000Z');
        check('a stored end date survives the editor', withEnd.end.mode === 'On date' && withEnd.end.onDate === '2026-12-31',
            JSON.stringify(withEnd.end));
        check('and is written back the same way',
            buildRRuleString(withEnd) === 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15;UNTIL=20261231T000000Z',
            buildRRuleString(withEnd));

        const broken = parseRRuleString(DEFAULT_EDITOR_STATE, 'FREQ=NONSENSE');
        check('a schedule that cannot be read says so instead of throwing', Boolean(broken.error));

        // A channel with no schedule yet: the modal has to end up with one.
        {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            const calls = [];

            act(() => {
                root.render(React.createElement(RRule, {
                    rrule: '',
                    startDate: '2026-09-26T00:00:00.000Z',
                    onChange: (rrule, startDate) => calls.push({rrule, startDate}),
                }));
            });

            check('mounting a channel with no schedule reports one',
                calls.length === 1 && calls[0].rrule === 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',
                JSON.stringify(calls[0]));
            check('and reports the start date it was given',
                calls[0] && calls[0].startDate === '2026-09-26T00:00:00.000Z');

            act(() => root.unmount());
        }

        // The editor itself: the controls are the kit's, and they swap with the
        // frequency rather than showing a weekly row under a monthly rule.
        {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            const calls = [];

            act(() => {
                root.render(React.createElement(RRule, {
                    rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15',
                    startDate: '2026-09-26T00:00:00.000Z',
                    onChange: (rrule, startDate) => calls.push({rrule, startDate}),
                }));
            });

            check('a monthly schedule shows the monthly controls',
                Boolean(container.querySelector('#standup-recurrence-monthly-day')) &&
                container.querySelector('#standup-recurrence-days') === null);
            check('the day it falls on is the stored one',
                container.querySelector('#standup-recurrence-monthly-day').textContent === '15');

            const frequency = container.querySelector('#standup-recurrence-frequency');
            act(() => frequency.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true, cancelable: true})));
            act(() => frequency.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true})));
            act(() => frequency.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})));

            check('choosing weekly swaps in the weekday chips',
                Boolean(container.querySelector('#standup-recurrence-days')) &&
                container.querySelector('#standup-recurrence-monthly-day') === null,
                container.querySelector('#standup-recurrence-days') ? 'chips shown' : 'no chips');

            // Weekdays are on by default, so unticking Monday leaves the rest.
            const monday = container.querySelector('#standup-recurrence-days-MO');
            check('the weekday chips start on the default weekdays', monday.checked);
            act(() => monday.click());
            check('unticking a day reports the new rule',
                calls[calls.length - 1].rrule === 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,WE,TH,FR',
                calls[calls.length - 1].rrule);

            act(() => root.unmount());
        }
    }

    console.log('\n[4] The modal opens for the channel a prompt asked for');
    {
        const {standupModalChannelId, Selectors, Constants} = bundle;
        const pluginStateKey = `plugins-${Constants.PLUGIN_NAME}`;

        check('opening from a prompt records its channel',
            standupModalChannelId('', {type: Constants.ACTIONS.OPEN_STANDUP_MODAL, channelId: 'channel_from_prompt'}) === 'channel_from_prompt');
        check('opening without a channel leaves no override',
            standupModalChannelId('stale_channel', {type: Constants.ACTIONS.OPEN_STANDUP_MODAL}) === '');
        check('closing forgets the channel',
            standupModalChannelId('channel_from_prompt', {type: Constants.ACTIONS.CLOSE_STANDUP_MODAL}) === '');

        const prompted = {
            [pluginStateKey]: {standupModalChannelId: 'channel_from_prompt'},
            entities: {channels: {currentChannelId: 'channel_being_read'}},
        };
        check('a prompt wins over the channel being viewed',
            Selectors.standupModalChannel(prompted) === 'channel_from_prompt');

        const browsing = {
            [pluginStateKey]: {},
            entities: {channels: {currentChannelId: 'channel_being_read'}},
        };
        check('without a prompt it follows the channel being viewed',
            Selectors.standupModalChannel(browsing) === 'channel_being_read');

        check('with neither it is empty rather than undefined',
            Selectors.standupModalChannel({}) === '');
    }

    console.log("\n[5] The plugin's own controls");
    {
        const {UI} = bundle;
        const {Field, Button, Toggle, Tabs, Modal, Select, TextInput, Alert} = UI;

        const mount = (element) => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            act(() => root.render(element));
            return {container, root, unmount: () => act(() => root.unmount())};
        };
        const click = (element) => act(() => element.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true, cancelable: true})));
        const mouseDown = (element) => act(() => element.dispatchEvent(new dom.window.MouseEvent('mousedown', {bubbles: true, cancelable: true})));
        const pressKey = (element, key, options = {}) => act(() => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...options})));
        const type = (input, value) => act(() => setInputValue(dom, input, value));

        // Field
        {
            const {container, unmount} = mount(
                React.createElement(Field, {label: 'Standup Report Format', description: 'How each day is grouped.', htmlFor: 'rf'},
                    React.createElement(TextInput, {id: 'rf', value: 'x', onChange: () => {}}),
                ),
            );
            const label = container.querySelector('label');
            const description = container.querySelector('.standup-field-description');
            check('a field renders its label, description and control in order',
                Boolean(label) && Boolean(description) && Boolean(container.querySelector('input')) &&
                container.textContent.indexOf('Standup Report Format') < container.textContent.indexOf('How each day is grouped.'));
            check('the label points at its control', label && label.getAttribute('for') === 'rf');
            check('the description is addressable for aria-describedby',
                Boolean(description) && description.id === UI.descriptionID('rf'));
            unmount();
        }

        // Button
        {
            let clicks = 0;
            const {container, unmount} = mount(React.createElement(Button, {onClick: () => clicks++, variant: 'primary'}, 'Save'));
            click(container.querySelector('button'));
            check('a button reports its click', clicks === 1);
            check('a primary button carries one class for its variant',
                container.querySelector('button').className.indexOf('standup-button-primary') >= 0);
            unmount();
        }

        // Toggle
        {
            let next = null;
            const {container, unmount} = mount(
                React.createElement(Toggle, {id: 'enabled', checked: false, onChange: (value) => {
                    next = value;
                }}),
            );
            const input = container.querySelector('input');
            check('a toggle is a real checkbox announced as a switch',
                input && input.type === 'checkbox' && input.getAttribute('role') === 'switch');
            check('a toggle reports its state', input.getAttribute('aria-checked') === 'false' || input.checked === false);
            input.click();
            check('toggling reports the value it should now have', next === true, `got ${next}`);
            unmount();

            // With a label of its own, the label is the click target.
            let fromLabel = null;
            const labelled = mount(
                React.createElement(Toggle, {
                    id: 'ooo',
                    label: 'Respect out of office',
                    checked: false,
                    onChange: (value) => {
                        fromLabel = value;
                    },
                }),
            );
            const label = labelled.container.querySelector('label');
            check('a toggle can carry its own label', Boolean(label) && label.textContent === 'Respect out of office');
            click(label);
            check('clicking the label toggles the control', fromLabel === true, `got ${fromLabel}`);
            labelled.unmount();
        }

        // Tabs
        {
            let active = 'general';
            const tabs = [
                {key: 'general', label: 'General', content: React.createElement('p', null, 'general panel')},
                {key: 'schedule', label: 'Schedule', content: React.createElement('p', null, 'schedule panel')},
            ];
            const {container, root, unmount} = mount(
                React.createElement(Tabs, {id: 'cfg', tabs, activeKey: active, onChange: (key) => {
                    active = key;
                    act(() => root.render(React.createElement(Tabs, {id: 'cfg', tabs, activeKey: key, onChange: () => {}})));
                }}),
            );
            const tablist = container.querySelector('[role="tablist"]');
            const selected = container.querySelector('[role="tab"][aria-selected="true"]');
            check('tabs are a tablist with one selected tab', Boolean(tablist) && Boolean(selected));
            check('every tab controls a panel that exists',
                Array.from(container.querySelectorAll('[role="tab"]')).every((tab) => document.getElementById(tab.getAttribute('aria-controls'))));
            const shown = dom.window.getComputedStyle(container.querySelector('#cfg-panel-general')).display;
            const other = dom.window.getComputedStyle(container.querySelector('#cfg-panel-schedule')).display;
            check('only the selected panel is displayed',
                shown !== 'none' && other === 'none', `selected panel: ${shown}, other: ${other}`);

            // This one can fail, and is the reason the hiding is done this way:
            // jsdom applies the user agent's `[hidden]` rule above any author
            // rule, so it cannot see the browser bug where a display rule of
            // ours outranked the attribute and showed every tab at once.
            check('the hidden panel is hidden by its own style, where no rule of ours can outrank it',
                container.querySelector('#cfg-panel-schedule').style.display === 'none' &&
                !container.querySelector('#cfg-panel-general').style.display);
            pressKey(selected, 'ArrowRight');
            check('an arrow key selects the next tab',
                container.querySelector('#cfg-panel-schedule').hidden === false);
            unmount();
        }

        // Modal
        {
            const opener = document.createElement('button');
            document.body.appendChild(opener);
            opener.focus();
            let hidden = 0;
            const {container, root, unmount} = mount(
                React.createElement(Modal, {show: false, onHide: () => hidden++, title: 'Configure', labelledBy: 'cfg-title'}, 'body'),
            );
            check('a closed modal renders nothing', container.children.length === 0);

            act(() => root.render(
                React.createElement(Modal, {show: true, onHide: () => hidden++, title: 'Configure', labelledBy: 'cfg-title'},
                    React.createElement(Button, null, 'First'),
                    React.createElement(Button, null, 'Last'),
                ),
            ));

            const dialog = document.querySelector('[role="dialog"]');
            check('an open modal is a labelled dialog',
                Boolean(dialog) && dialog.getAttribute('aria-modal') === 'true' &&
                document.getElementById(dialog.getAttribute('aria-labelledby')).textContent === 'Configure');
            check('the dialog takes focus when it opens', document.activeElement === dialog);

            const buttons = dialog.querySelectorAll('button');
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            last.focus();
            pressKey(last, 'Tab');
            check('Tab from the last control wraps to the first', document.activeElement === first);
            pressKey(first, 'Tab', {shiftKey: true});
            check('Shift+Tab from the first wraps to the last', document.activeElement === last);

            pressKey(document.activeElement, 'Escape');
            check('Escape asks to close', hidden === 1, `got ${hidden}`);

            act(() => root.render(React.createElement(Modal, {show: false, onHide: () => hidden++, title: 'Configure', labelledBy: 'cfg-title'}, 'body')));
            check('focus goes back to whatever opened the dialog', document.activeElement === opener);
            unmount();
        }

        // Select
        {
            const options = [
                {value: 'user_aggregated', label: 'User Aggregated'},
                {value: 'type_aggregated', label: 'Type Aggregated'},
                {value: 'none', label: 'None'},
            ];
            let picked = null;
            let modalHides = 0;
            const {container, root, unmount} = mount(
                React.createElement(Modal, {show: true, onHide: () => modalHides++, title: 'Configure', labelledBy: 'sel-title'},
                    React.createElement(Select, {
                        id: 'report-format',
                        value: 'user_aggregated',
                        options,
                        onChange: (value) => {
                            picked = value;
                        },
                    }),
                ),
            );

            // The modal portals its children to the body, so the select lives
            // there rather than inside the mount container.
            const trigger = document.querySelector('#report-format');
            check('a select is a combobox that starts collapsed',
                trigger && trigger.getAttribute('role') === 'combobox' && trigger.getAttribute('aria-expanded') === 'false');
            check('a collapsed select renders no options', document.querySelectorAll('[role="option"]').length === 0);

            click(trigger);
            const listbox = document.querySelector('[role="listbox"]');
            check('clicking a select opens its listbox', Boolean(listbox) && trigger.getAttribute('aria-expanded') === 'true');

            // The listbox belongs to the dialog. Portalled anywhere else it would
            // be the dialog's sibling, and which of the two paints on top would
            // come down to z-index numbers the host does not always define.
            check('the listbox is inside the dialog rather than beside it',
                Boolean(listbox) && document.querySelector('[role="dialog"]').contains(listbox));
            check('the listbox is named by the select', listbox && listbox.getAttribute('aria-label') === null);
            check('the selected option is marked',
                document.querySelectorAll('[role="option"][aria-selected="true"]').length === 1);

            pressKey(trigger, 'ArrowDown');
            check('an arrow key marks the option the user is on',
                trigger.getAttribute('aria-activedescendant') === UI.optionID('report-format-listbox', options[1]),
                `got ${trigger.getAttribute('aria-activedescendant')}`);

            pressKey(trigger, 'Enter');
            check('Enter picks the active option', picked === 'type_aggregated', `got ${picked}`);
            check('picking closes the listbox', document.querySelectorAll('[role="listbox"]').length === 0);

            // Escape inside an open menu must not reach the modal behind it.
            click(trigger);
            pressKey(trigger, 'Escape');
            check('Escape closes the listbox', document.querySelectorAll('[role="listbox"]').length === 0);
            check('Escape in the listbox does not close the modal', modalHides === 0, `modal hid ${modalHides} times`);

            // Committing with the mouse
            click(trigger);
            mouseDown(document.querySelectorAll('[role="option"]')[2]);
            check('a click on an option picks it', picked === 'none', `got ${picked}`);

            unmount();
        }

        // Select: searching and the size of the timezone list
        {
            const many = [];
            for (let hour = 0; hour < 24; hour++) {
                for (let minute = 0; minute < 30; minute++) {
                    many.push({value: `${hour}:${minute}`, label: `Asia/Kolkata ${hour}:${minute}`});
                }
            }
            const {container, root, unmount} = mount(
                React.createElement(Select, {
                    id: 'timezone',
                    value: '',
                    options: many,
                    searchable: true,
                    onChange: () => {},
                }),
            );

            const input = container.querySelector('#timezone');
            check('a searchable select is an editable combobox',
                input && input.tagName === 'INPUT' && input.getAttribute('role') === 'combobox' &&
                input.getAttribute('aria-autocomplete') === 'list');

            click(input);
            const total = document.querySelectorAll('[role="option"]').length;
            check('a long list is windowed rather than rendered whole',
                total > 0 && total < 35, `${total} of ${many.length} options in the DOM`);

            type(input, 'kolkata 3:4');
            const filtered = document.querySelectorAll('[role="option"]');
            check('typing filters the list', filtered.length === 1, `${filtered.length} options left`);
            check('the match is the one that was typed',
                filtered[0] && filtered[0].textContent.indexOf('3:4') >= 0, filtered[0] && filtered[0].textContent);

            unmount();
        }

        // Alert
        {
            const {container, unmount} = mount(React.createElement(Alert, {variant: 'danger'}, 'Cannot upgrade'));
            const alert = container.querySelector('.standup-alert');
            check('a failure is announced as an alert', alert && alert.getAttribute('role') === 'alert');
            unmount();
        }
    }

    console.log('\n[6] The configure modal');
    {
        const {ConfigModal, buildStandupConfigPayload, TimePicker} = bundle;
        const stub = global.__superagentStub;

        // What the server GET returns: sections are a list of prompts.
        const stored = {
            windowOpenTime: '09:30',
            windowCloseTime: '18:00',
            reportFormat: 'type_aggregated',
            sections: ['What did you do today?', 'What will you do today?'],
            members: ['user_one', 'user_two'],
            enabled: true,
            timezone: 'Asia/Kolkata',
            windowCloseReminderEnabled: false,
            windowOpenReminderEnabled: true,
            scheduleEnabled: true,
            rruleString: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',
            startDate: '2026-09-26T00:00:00.000Z',
        };

        // The same thing as the modal holds it: sections keyed by row name,
        // with room for one more.
        const state = {
            ...stored,
            sections: {line1: 'What did you do today?', line2: 'What will you do today?', line3: '   '},
        };
        const body = {
            channelId: 'channel_id',
            windowOpenTime: '09:30',
            windowCloseTime: '18:00',
            reportFormat: 'type_aggregated',
            sections: ['What did you do today?', 'What will you do today?'],
            members: ['user_one', 'user_two'],
            enabled: true,
            timezone: 'Asia/Kolkata',
            windowCloseReminderEnabled: false,
            windowOpenReminderEnabled: true,
            scheduleEnabled: true,
            rruleString: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',
            startDate: '2026-09-26T00:00:00.000Z',
        };

        check('the save body is exactly what the server has always received',
            JSON.stringify(buildStandupConfigPayload(state, 'channel_id')) === JSON.stringify(body),
            JSON.stringify(buildStandupConfigPayload(state, 'channel_id')));
        check('the empty section row is not sent',
            buildStandupConfigPayload(state, 'channel_id').sections.length === 2);

        // The time picker: two selects and the colon between them.
        {
            let time = null;
            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            act(() => root.render(React.createElement(TimePicker, {
                id: 'window-start-time',
                time: '09:30',
                onChange: (value) => {
                    time = value;
                },
            })));

            const hours = container.querySelector('#window-start-time-hours');
            const minutes = container.querySelector('#window-start-time-minutes');
            check('the picker shows the time it was given',
                hours.textContent === '09' && minutes.textContent === '30',
                `${hours.textContent}:${minutes.textContent}`);

            const keyDown = (element, key) => act(() => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})));
            act(() => hours.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true, cancelable: true})));
            keyDown(hours, 'ArrowDown');
            keyDown(hours, 'Enter');
            check('picking an hour reports a zero-padded HH:MM', time === '10:30', `got ${time}`);

            act(() => root.unmount());
        }

        // The modal, opened the way Mattermost opens it and saved through the
        // stubbed network.
        {
            document.cookie = 'MMCSRF=csrf_token';
            stub.reset();
            stub.queue({ok: true, status: 200, body: stored});
            stub.queue({ok: true, status: 200, body: {permissionSchemaEnabled: false}});

            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            const render = (visible) => act(() => root.render(React.createElement(ConfigModal, {
                channelID: 'channel_id',
                currentUserId: 'user_one',
                userRoles: [],
                visible,
                close: () => {},
                siteURL: 'https://mm.example.com',
                isGuest: false,
            })));

            // It loads when it becomes visible, not when it is mounted.
            render(false);
            check('a closed modal renders nothing', document.querySelector('[role="dialog"]') === null);
            render(true);

            // Let the two queued GETs settle.
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });

            {
                const dialog = document.querySelector('[role="dialog"]');
                check('opening it loads the saved configuration', Boolean(dialog));
                const controls = [
                    'standup-config-enabled',
                    'standup-config-schedule-enabled',
                    'standup-config-report-format',
                    'standup-config-window-open-reminder',
                    'standup-config-window-close-reminder',
                    'window-start-time-hours',
                    'standup-config-timezone',
                ];
                const unlabelled = controls.filter((controlID) => {
                    const control = document.querySelector(`#${controlID}`);
                    return !control || !document.querySelector(`label[for="${controlID}"]`);
                });
                check('every setting is there, and every one of them is labelled', unlabelled.length === 0,
                    `missing or unlabelled: ${unlabelled.join(', ')}`);
                check('the saved report format is what the select shows',
                    document.querySelector('#standup-config-report-format').textContent.indexOf('Type Aggregated') >= 0);
                check('the saved timezone is what the field shows',
                    document.querySelector('#standup-config-timezone').value === 'Asia/Kolkata',
                    document.querySelector('#standup-config-timezone').value);
                check('the sections come back with one empty row to type into',
                    document.querySelectorAll('.standup-config-sections input').length === 3);
                check('the schedule tab holds the saved recurrence',
                    document.querySelector('#standup-config-tabs-panel-schedule').textContent.indexOf('Start Date') >= 0);

                // Change one thing the way a user would, then save.
                const reportFormat = document.querySelector('#standup-config-report-format');
                act(() => reportFormat.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true, cancelable: true})));
                act(() => reportFormat.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true, cancelable: true})));
                act(() => reportFormat.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})));
                check('the select took the new value',
                    document.querySelector('#standup-config-report-format').textContent.indexOf('User Aggregated') >= 0);

                act(() => Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === 'Save')[0].click());

                const post = stub.requests.filter((request) => request.method === 'post')[0];
                check('saving posts to the config endpoint for this channel',
                    Boolean(post) && post.url === 'https://mm.example.com/plugins/standup-raven/config?channel_id=channel_id',
                    post && post.url);
                check('saving carries the CSRF token', Boolean(post) && post.headers['X-CSRF-Token'] === 'csrf_token');
                check('and the body is unchanged apart from what was edited',
                    Boolean(post) && JSON.stringify(post.body) === JSON.stringify({...body, reportFormat: 'user_aggregated'}),
                    post && JSON.stringify(post.body));

                act(() => root.unmount());
            }
        }
    }

    console.log('\n[7] The fill-in standup modal');
    {
        const {StandupModal, buildUserStandupPayload} = bundle;
        const stub = global.__superagentStub;

        check('blank lines are not submitted',
            JSON.stringify(buildUserStandupPayload({standup: {Today: {line1: ' did a thing ', line2: '   ', line3: 'and another'}}}, 'channel_id')) ===
            JSON.stringify({channelId: 'channel_id', standup: {Today: ['did a thing', 'and another']}}),
            JSON.stringify(buildUserStandupPayload({standup: {Today: {line1: ' did a thing '}}}, 'channel_id')));

        const open = async (config, filled) => {
            stub.reset();
            stub.queue({ok: true, status: 200, body: config});
            stub.queue({ok: true, status: 200, body: {standup: filled}});

            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            const render = (visible) => act(() => root.render(React.createElement(StandupModal, {
                channelID: 'channel_id',
                currentUserId: 'user_one',
                visible,
                close: () => {},
                siteURL: 'https://mm.example.com',
                isGuest: false,
            })));

            render(false);
            render(true);
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
                await Promise.resolve();
            });

            return {container, root};
        };

        const channelConfig = {
            enabled: true,
            members: ['user_one', 'user_two'],
            sections: ['Today', 'Tomorrow'],
        };

        {
            const {container, root} = await open(channelConfig, {Today: ['what I did']});

            const lines = document.querySelectorAll('.standup-modal-line');
            check('the modal opens on the first section', document.querySelector('.standup-modal-section').textContent === 'Today');
            check('what was filed earlier today comes back', lines[0] && lines[0].value === 'what I did', lines[0] && lines[0].value);
            check('with an empty row after it to type into', lines.length === 2, `${lines.length} rows`);

            const submit = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === 'Submit')[0];
            check('submit waits for the last section', submit.disabled === true);
            check('and says why', document.body.textContent.indexOf('Move to the last section') >= 0);

            const next = document.querySelector('[aria-label="Next section"]');
            act(() => next.click());
            check('the arrow moves to the next section', document.querySelector('.standup-modal-section').textContent === 'Tomorrow');
            check('submit is available on the last section', submit.disabled === false);

            const previous = document.querySelector('[aria-label="Previous section"]');
            check('the previous arrow is available here', previous.disabled === false);
            act(() => previous.click());
            check('and goes back', document.querySelector('.standup-modal-section').textContent === 'Today');

            act(() => next.click());
            const line = document.querySelectorAll('.standup-modal-line')[0];
            act(() => {
                const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
                setter.call(line, 'something for tomorrow');
                line.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
            });
            act(() => submit.click());

            const post = stub.requests.filter((request) => request.method === 'post')[0];
            check('submitting posts the standup for this channel',
                Boolean(post) && post.url === 'https://mm.example.com/plugins/standup-raven/standup?channel_id=channel_id',
                post && post.url);
            check('only the sections with something in them are sent',
                Boolean(post) && JSON.stringify(post.body) === JSON.stringify({
                    channelId: 'channel_id',
                    standup: {Today: ['what I did'], Tomorrow: ['something for tomorrow']},
                }),
                post && JSON.stringify(post.body));

            act(() => root.unmount());
        }

        // Someone who is not on the standup is told so rather than shown a form
        // whose submit would be refused.
        {
            const {container, root} = await open({...channelConfig, members: ['user_two']}, {});

            check('a member who is not on the standup is told',
                document.body.textContent.indexOf('You are not a part of this channel\'s standup.') >= 0);
            check('and no form is shown', document.querySelectorAll('.standup-modal-line').length === 0);

            act(() => root.unmount());
        }

        // A channel with the standup switched off.
        {
            const {container, root} = await open({...channelConfig, enabled: false}, {});

            check('a disabled standup says so',
                document.body.textContent.indexOf('Standup is disabled for this channel.') >= 0);

            act(() => root.unmount());
        }
    }

    console.log('\n[8] Nothing left that React 19 removed');
    {
        const {readFileSync} = require('fs');

        // Patterns that would either break on React 19, drag a second copy of
        // React into the bundle, or reach over the host's own styling.
        const forbidden = [
            ['findDOMNode', 'removed in React 19: hold a ref instead'],
            ['ReactDOM.render', 'removed in React 19: the host owns the root'],
            ['createReactClass', 'not supported by React 19'],
            ['componentWillMount', 'a lifecycle deprecated since React 16'],
            ['componentWillReceiveProps', 'a lifecycle deprecated since React 16'],
            ['contextTypes', 'legacy context is removed in React 19'],
            ["react-dom/client", 'only react-dom is an external, so this bundles a second React'],
            ['ReactBootstrap', 'the host global this no longer builds on'],
            ['!important', 'a stylesheet reaching over the host'],
        ];

        const offenders = [];
        for (const file of sourceFiles('js').concat(sourceFiles('jsx'), sourceFiles('css'))) {
            const text = readFileSync(file, 'utf8');
            for (const [needle, why] of forbidden) {
                if (text.indexOf(needle) >= 0) {
                    offenders.push(`${path.relative(path.join(__dirname, '..'), file)}: ${needle} (${why})`);
                }
            }
        }

        check('the plugin sources are free of all of it', offenders.length === 0, offenders.join('; '));
    }

    console.log('\n[9] A crash in the plugin stays in the plugin');
    {
        const {SentryBoundary} = bundle;
        const consoleError = console.error;
        const quietly = (work) => {
            // React logs a caught error itself. The point here is that it is
            // caught, so the log is quietened rather than the assertion.
            try {
                console.error = () => {};
                act(work);
            } finally {
                console.error = consoleError;
            }
        };

        const mount = (element) => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            quietly(() => root.render(element));
            return {container, root};
        };

        {
            const {container, root} = mount(React.createElement(SentryBoundary, null, React.createElement('p', null, 'working')));
            check('with nothing wrong the boundary is transparent',
                container.textContent === 'working', container.textContent);
            act(() => root.unmount());
        }

        const Boom = () => {
            throw new Error('deliberate');
        };

        {
            const {container, root} = mount(React.createElement(SentryBoundary, null, React.createElement(Boom)));
            check('a component that throws shows the message instead of the page breaking',
                container.textContent.indexOf('Standup Raven ran into an unexpected error.') >= 0,
                container.textContent);
            check('and offers a way back', Boolean(container.querySelector('button')));

            // Trying again re-renders rather than escaping the boundary: the
            // child throws every time, and every time it is caught.
            const again = container.querySelector('button');
            quietly(() => again.click());
            check('trying again is caught too rather than thrown at the host',
                container.textContent.indexOf('Standup Raven ran into an unexpected error.') >= 0,
                container.textContent);

            act(() => root.unmount());
        }

        // The wiring the host actually gets: a root component wrapped so that a
        // crash inside it stays inside it.
        {
            const Fine = () => React.createElement('p', null, 'the modal');
            const guarded = bundle.withBoundary(Fine);
            const {container, root} = mount(React.createElement(guarded, {theme: 'any'}));
            check('a guarded component renders as usual when it works',
                container.textContent === 'the modal', container.textContent);

            const guardedBoom = bundle.withBoundary(Boom);
            const broken = mount(React.createElement(guardedBoom, null));
            check('and shows the message when it does not',
                broken.container.textContent.indexOf('Standup Raven ran into an unexpected error.') >= 0,
                broken.container.textContent);

            act(() => root.unmount());
            act(() => broken.root.unmount());
        }

        {
            const fallback = React.createElement('p', null, 'a message of our own');
            const {container, root} = mount(React.createElement(SentryBoundary, {fallback}, React.createElement(Boom)));
            check('a caller can supply its own fallback',
                container.textContent === 'a message of our own', container.textContent);
            act(() => root.unmount());
        }
    }

    console.log('');

    // Exit explicitly. React's scheduler keeps a MessageChannel open, and the
    // modal's auto-close leaves a timer behind, so the event loop would stay
    // alive after the last check has run and its result printed.
    if (failures.length) {
        console.log(`FAILED: ${failures.length} check(s): ${failures.join(', ')}`);
        process.exit(1);
    }
    console.log(`all checks passed under React ${REACT_MAJOR}`);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
