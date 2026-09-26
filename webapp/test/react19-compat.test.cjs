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

    console.log('');
    if (failures.length) {
        console.log(`FAILED: ${failures.length} check(s): ${failures.join(', ')}`);
        process.exit(1);
    }
    console.log('all checks passed under React 19');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
