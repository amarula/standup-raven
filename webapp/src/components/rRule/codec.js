import {RRule, rrulestr} from 'rrule';
import moment from 'moment';

// Turns the recurrence editor's state into the RRULE string the server stores,
// and back again. It is a pair of pure functions so the agreed text can be
// asserted without a browser, and so a change to the editor cannot quietly
// change what a saved schedule means.

const DATE_FORMAT = 'YYYY-MM-DD';

export const FREQUENCIES = ['Monthly', 'Weekly'];

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The ten things "on the ..." can name: one weekday, any day, a weekday, or a
// weekend day. rrule numbers days from Monday.
export const MONTHLY_THE_DAYS = [...WEEKDAY_NAMES, 'Day', 'Weekday', 'Weekend day'];

const WEEKDAYS_BY_NAME = {
    Monday: [0],
    Tuesday: [1],
    Wednesday: [2],
    Thursday: [3],
    Friday: [4],
    Saturday: [5],
    Sunday: [6],
    Day: [0, 1, 2, 3, 4, 5, 6],
    Weekday: [0, 1, 2, 3, 4],
    'Weekend day': [5, 6],
};

export const WHICH_NAMES = ['First', 'Second', 'Third', 'Fourth', 'Last'];

const SETPOS_BY_WHICH = {First: 1, Second: 2, Third: 3, Fourth: 4, Last: -1};

// A brand new channel starts on weekdays: the default the plugin has always
// saved when nothing was configured yet.
export const DEFAULT_EDITOR_STATE = {
    frequency: 'Weekly',
    interval: 1,
    weeklyDays: ['MO', 'TU', 'WE', 'TH', 'FR'],
    monthlyMode: 'on',
    monthlyDay: 1,
    monthlyWhich: 'First',
    monthlyTheDay: 'Monday',
    end: {
        mode: 'Never',
        after: 1,
        onDate: '',
    },
};

function weekdayIndex(weekday) {
    return typeof weekday === 'number' ? weekday : weekday.weekday;
}

export function buildRRuleString(editor) {
    const options = {
        freq: editor.frequency === 'Monthly' ? RRule.MONTHLY : RRule.WEEKLY,
        interval: editor.interval,
        dtstart: null,
    };

    if (editor.frequency === 'Weekly') {
        options.byweekday = editor.weeklyDays.map((code) => WEEKDAY_CODES.indexOf(code));
    } else if (editor.monthlyMode === 'on') {
        options.bymonthday = editor.monthlyDay;
    } else {
        options.bysetpos = SETPOS_BY_WHICH[editor.monthlyWhich];
        options.byweekday = WEEKDAYS_BY_NAME[editor.monthlyTheDay];
    }

    // The end of a schedule is not editable here, but a stored one has to
    // survive a round trip: dropping it would silently make a schedule run for
    // ever.
    if (editor.end.mode === 'After') {
        options.count = editor.end.after;
    } else if (editor.end.mode === 'On date' && editor.end.onDate) {
        options.until = moment(editor.end.onDate).format();
    }

    return new RRule(options).toString().replace('RRULE:', '');
}

function parseEnd(editor, options) {
    if (options.count || options.count === 0) {
        return {mode: 'After', after: options.count, onDate: editor.end.onDate};
    }

    if (options.until) {
        return {mode: 'On date', after: editor.end.after, onDate: moment(options.until).format(DATE_FORMAT)};
    }

    return {mode: 'Never', after: editor.end.after, onDate: editor.end.onDate};
}

export function parseRRuleString(editor, rruleString) {
    if (!rruleString) {
        return editor;
    }

    let options;
    try {
        options = rrulestr(rruleString).origOptions;
    } catch (error) {
        return {...editor, error: 'This channel has a schedule that could not be read. Saving will replace it.'};
    }

    const next = {...editor, error: null};

    if (options.freq === RRule.MONTHLY) {
        next.frequency = 'Monthly';
    } else if (options.freq === RRule.WEEKLY) {
        next.frequency = 'Weekly';
    }

    next.interval = options.interval || 1;
    next.end = parseEnd(editor, options);

    const weekdays = options.byweekday === undefined ? [] : [].concat(options.byweekday).map(weekdayIndex);

    if (next.frequency === 'Weekly') {
        // No BYDAY at all means every day, so the chips come back empty rather
        // than on the default weekdays: writing them back would change what the
        // schedule means.
        next.weeklyDays = weekdays.
            map((index) => WEEKDAY_CODES[index]).
            filter((code) => Boolean(code)).
            sort((left, right) => WEEKDAY_CODES.indexOf(left) - WEEKDAY_CODES.indexOf(right));
    }

    if (next.frequency === 'Monthly') {
        if (options.bymonthday) {
            next.monthlyMode = 'on';
            next.monthlyDay = [].concat(options.bymonthday)[0];
        } else if (weekdays.length) {
            next.monthlyMode = 'onThe';
            next.monthlyTheDay = MONTHLY_THE_DAYS.find(
                (name) => WEEKDAYS_BY_NAME[name].join(',') === weekdays.join(','),
            ) || editor.monthlyTheDay;
            const setpos = options.bysetpos === undefined ? 1 : [].concat(options.bysetpos)[0];
            next.monthlyWhich = WHICH_NAMES.find((name) => SETPOS_BY_WHICH[name] === setpos) || editor.monthlyWhich;
        }
    }

    return next;
}

export default {buildRRuleString, parseRRuleString};
