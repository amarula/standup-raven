import * as React from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';

import {Alert, DayChips, Field, Radios, Select, TextInput} from '../ui';
import {
    buildRRuleString,
    DEFAULT_EDITOR_STATE,
    FREQUENCIES,
    MONTHLY_THE_DAYS,
    parseRRuleString,
    WEEKDAY_CODES,
    WHICH_NAMES,
} from './codec';

const DATE_TIME_FORMAT = 'YYYY-MM-DD';

const START_DATE_ID = 'recurrence-start-date-picker';
const FREQUENCY_ID = 'standup-recurrence-frequency';
const INTERVAL_ID = 'standup-recurrence-interval';
const MONTHLY_MODE_ID = 'standup-recurrence-monthly-mode';
const MONTHLY_DAY_ID = 'standup-recurrence-monthly-day';
const MONTHLY_WHICH_ID = 'standup-recurrence-monthly-which';
const MONTHLY_THE_DAY_ID = 'standup-recurrence-monthly-the-day';
const DAYS_ID = 'standup-recurrence-days';

const FREQUENCY_OPTIONS = FREQUENCIES.map((frequency) => ({value: frequency, label: frequency}));
const WHICH_OPTIONS = WHICH_NAMES.map((which) => ({value: which, label: which}));
const THE_DAY_OPTIONS = MONTHLY_THE_DAYS.map((day) => ({value: day, label: day}));
const MONTH_DAYS = Array.from({length: 31}, (unused, index) => ({value: String(index + 1), label: String(index + 1)}));
const MONTHLY_MODES = [
    {value: 'on', label: 'On a day of the month'},
    {value: 'onThe', label: 'On a day of the week'},
];
const DAY_CHIPS = [
    {value: 'MO', label: 'Mon'},
    {value: 'TU', label: 'Tue'},
    {value: 'WE', label: 'Wed'},
    {value: 'TH', label: 'Thu'},
    {value: 'FR', label: 'Fri'},
    {value: 'SA', label: 'Sat'},
    {value: 'SU', label: 'Sun'},
];

class RRule extends React.PureComponent {
    constructor(props) {
        super(props);

        const editor = parseRRuleString(DEFAULT_EDITOR_STATE, props.rrule || '');

        this.state = {
            editor,
            startDate: props.startDate || new Date().toISOString(),

            // What we last told the modal. A value coming back that matches it
            // is our own echo, and re-reading it would fight the user's typing.
            emitted: buildRRuleString(editor),
        };
    }

    // The rule is read once, when the editor mounts: the modal only renders it
    // after the saved configuration has arrived, and reads what this editor
    // reports from then on. Watching the prop instead means reading our own
    // echo back, and any parent that does not echo it - a test, or a slower
    // render - would undo the choice the user just made.
    componentDidMount() {
        // A channel that has never been scheduled still has to save a rule: the
        // server refuses a standup that says it is scheduled and carries none.
        this.props.onChange(this.state.emitted, this.state.startDate);
    }

    handleStartDateChange = (event) => {
        // The input reports a YYYY-MM-DD date, while the API below expects an
        // ISO timestamp. Anchor it to UTC so the date picked is the date saved,
        // whatever the browser's timezone.
        const startDate = moment.utc(event.target.value, DATE_TIME_FORMAT).toISOString();

        this.setState({startDate});
        this.props.onChange(this.state.emitted, startDate);
    };

    handleIntervalChange = (event) => {
        // Input that cannot be a count of weeks or months is ignored rather than
        // clamped, which is what the editor this replaces did.
        const interval = Number(event.target.value);

        if (Number.isNaN(interval) || interval <= 0 || interval >= 1000) {
            return;
        }

        this.updateEditor({interval});
    };

    handleDayToggle = (code) => {
        const {weeklyDays} = this.state.editor;
        const next = weeklyDays.indexOf(code) >= 0 ?
            weeklyDays.filter((day) => day !== code) :
            [...weeklyDays, code].sort((left, right) => WEEKDAY_CODES.indexOf(left) - WEEKDAY_CODES.indexOf(right));

        this.updateEditor({weeklyDays: next});
    };

    updateEditor = (changes) => {
        const editor = {...this.state.editor, ...changes};
        const emitted = buildRRuleString(editor);

        this.setState({editor, emitted});
        this.props.onChange(emitted, this.state.startDate);
    };

    render() {
        const {editor} = this.state;
        const {disabled} = this.props;

        return (
            <React.Fragment>
                {editor.error ? (
                    <Alert variant={'warning'}>{editor.error}</Alert>
                ) : null}
                <Field
                    label={'Start Date'}
                    description={'The date the schedule counts from.'}
                    htmlFor={START_DATE_ID}
                    disabled={disabled}
                >
                    <input
                        id={START_DATE_ID}
                        type={'date'}
                        className={'standup-control'}
                        value={moment(this.state.startDate).format(DATE_TIME_FORMAT)}
                        onChange={this.handleStartDateChange}
                        disabled={disabled}
                    />
                </Field>
                <Field
                    label={'Repeat'}
                    description={'How often the standup is collected.'}
                    htmlFor={FREQUENCY_ID}
                    disabled={disabled}
                >
                    <Select
                        id={FREQUENCY_ID}
                        value={editor.frequency}
                        options={FREQUENCY_OPTIONS}
                        onChange={(frequency) => this.updateEditor({frequency})}
                        disabled={disabled}
                    />
                </Field>
                <Field
                    label={'Every'}
                    htmlFor={INTERVAL_ID}
                    disabled={disabled}
                >
                    <TextInput
                        id={INTERVAL_ID}
                        type={'number'}
                        min={1}
                        value={editor.interval}
                        onChange={this.handleIntervalChange}
                        disabled={disabled}
                        className={'standup-interval'}
                        ariaLabel={'Number of weeks or months between standups'}
                    />
                    <span className={'standup-field-suffix'}>
                        {editor.frequency === 'Weekly' ? 'weeks' : 'months'}
                    </span>
                </Field>
                {editor.frequency === 'Weekly' ? (
                    <Field
                        label={'On'}
                        description={'The days the standup is collected.'}
                        disabled={disabled}
                    >
                        <DayChips
                            id={DAYS_ID}
                            days={DAY_CHIPS}
                            selected={editor.weeklyDays}
                            onToggle={this.handleDayToggle}
                            disabled={disabled}
                            ariaLabel={'Days of the week'}
                        />
                    </Field>
                ) : (
                    <React.Fragment>
                        <Field
                            label={'On'}
                            description={'Which day of the month the standup falls on.'}
                            disabled={disabled}
                        >
                            <Radios
                                name={MONTHLY_MODE_ID}
                                value={editor.monthlyMode}
                                options={MONTHLY_MODES}
                                onChange={(monthlyMode) => this.updateEditor({monthlyMode})}
                                disabled={disabled}
                                ariaLabel={'Monthly schedule'}
                            />
                        </Field>
                        {editor.monthlyMode === 'on' ? (
                            <Field
                                label={'Day of the month'}
                                htmlFor={MONTHLY_DAY_ID}
                                disabled={disabled}
                            >
                                <Select
                                    id={MONTHLY_DAY_ID}
                                    value={String(editor.monthlyDay)}
                                    options={MONTH_DAYS}
                                    onChange={(value) => this.updateEditor({monthlyDay: Number(value)})}
                                    disabled={disabled}
                                    ariaLabel={'Day of the month'}
                                />
                            </Field>
                        ) : (
                            <Field
                                label={'Which day'}
                                disabled={disabled}
                            >
                                <Select
                                    id={MONTHLY_WHICH_ID}
                                    value={editor.monthlyWhich}
                                    options={WHICH_OPTIONS}
                                    onChange={(monthlyWhich) => this.updateEditor({monthlyWhich})}
                                    disabled={disabled}
                                    ariaLabel={'Which one of the month'}
                                />
                                <Select
                                    id={MONTHLY_THE_DAY_ID}
                                    value={editor.monthlyTheDay}
                                    options={THE_DAY_OPTIONS}
                                    onChange={(monthlyTheDay) => this.updateEditor({monthlyTheDay})}
                                    disabled={disabled}
                                    ariaLabel={'Day of the week'}
                                />
                            </Field>
                        )}
                    </React.Fragment>
                )}
            </React.Fragment>
        );
    }
}

RRule.propTypes = {
    rrule: PropTypes.string,
    startDate: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

RRule.defaultProps = {
    rrule: '',
    startDate: '',
    disabled: false,
};

export default RRule;
