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
// externals at them. react-bootstrap is stubbed (see host-react-bootstrap.cjs),
// the rest are the real packages.
function setUpDom() {
    const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {url: 'http://localhost/'});
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.Element = dom.window.Element;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    global.ReactBootstrap = require('./host-react-bootstrap.cjs');
    global.PostUtils = {
        formatText: (text) => text,
        messageHtmlToComponent: (element) => element,
    };
    return dom;
}

// Local midnight of a YYYY-MM-DD day, as rrule text spells it in UTC.
function rruleStamp(day) {
    return new Date(`${day}T00:00:00`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function setInputValue(dom, input, value) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    // React maps onChange to the input event for text-like inputs, but date
    // inputs are handled through the change event, so send both.
    input.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    input.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
}

async function buildBundle() {
    const outfile = path.join(__dirname, 'bundle.cjs');
    await esbuild.build({
        entryPoints: [path.join(__dirname, 'entry.jsx')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        loader: {'.css': 'empty', '.svg': 'text', '.png': 'empty'},
        // react19/react-dom19 are npm aliases in package.json: the host's React
        // major, installed next to the React the bundle is declared against.
        alias: {
            react: 'react19',
            'react-dom': 'react-dom19',
            'react-dom/client': 'react-dom19/client',
            'react-bootstrap': path.join(__dirname, 'host-react-bootstrap.cjs'),
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
    const {React, ReactDOMClient, RRule, RRuleGenerator} = bundle;
    const {act} = React;
    const {createRoot} = ReactDOMClient;

    console.log(`\nReact ${React.version} | react-dom ${require('react-dom19/package.json').version}`);

    console.log('\n[1] The API the old date pickers called');
    check('ReactDOM.findDOMNode is gone in React 19',
        typeof require('react-dom19').findDOMNode === 'undefined');

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

    console.log('\n[3] RRuleGenerator start and end "on date" fields');
    {
        // UNTIL opens the end section in "On date" mode, which is what feeds the
        // end date field.
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const calls = [];

        act(() => {
            root.render(React.createElement(RRuleGenerator, {
                config: {repeat: ['Monthly', 'Yearly'], hideStart: false, hideEnd: false},
                value: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15;UNTIL=20261231T000000Z',
                onChange: (value) => calls.push(value),
            }));
        });

        const startInput = container.querySelector('input[name="start.onDate.date"]');
        const endInput = container.querySelector('input[name="end.onDate.date"]');
        check('renders the start on-date input', Boolean(startInput));
        check('renders the end on-date input', Boolean(endInput));

        if (startInput) {
            check('start input shows the date it was given', startInput.value.length === 10,
                `value was ${startInput.value}`);

            const before = calls.length;
            act(() => setInputValue(dom, startInput, '2026-11-03'));
            check('start input is wired to the generator', calls.length > before);

            const emitted = calls[calls.length - 1] || '';
            check('picking a start date moves DTSTART to that date',
                emitted.includes(`DTSTART:${rruleStamp('2026-11-03')}`), `emitted ${JSON.stringify(emitted)}`);
        }

        if (endInput) {
            const before = calls.length;
            act(() => setInputValue(dom, endInput, '2027-02-14'));
            check('end input is wired to the generator', calls.length > before);

            const emitted = calls[calls.length - 1] || '';
            check('picking an end date moves UNTIL to that date',
                emitted.includes(`UNTIL=${rruleStamp('2027-02-14')}`), `emitted ${JSON.stringify(emitted)}`);
        }

        act(() => root.unmount());
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
            check('only the selected panel is visible',
                container.querySelector('#cfg-panel-general').hidden === false &&
                container.querySelector('#cfg-panel-schedule').hidden === true);
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
                check('every setting is a labelled row', document.querySelectorAll('.standup-field').length === 8,
                    `${document.querySelectorAll('.standup-field').length} rows`);
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

    console.log('');

    // Exit explicitly. React's scheduler keeps a MessageChannel open, and the
    // modal's auto-close leaves a timer behind, so the event loop would stay
    // alive after the last check has run and its result printed.
    if (failures.length) {
        console.log(`FAILED: ${failures.length} check(s): ${failures.join(', ')}`);
        process.exit(1);
    }
    console.log('all checks passed under React 19');
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
