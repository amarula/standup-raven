import * as React from 'react';
import PropTypes from 'prop-types';
import {Select} from '../ui';
import './style.css';

const HOURS_MAX = 23;
const MINUTES_MAX = 59;

function pad(value) {
    return value < 10 ? `0${value}` : String(value);
}

// Built once: 24 + 60 options that never change.
const HOURS = Array.from({length: HOURS_MAX + 1}, (unused, hour) => ({value: pad(hour), label: pad(hour)}));
const MINUTES = Array.from({length: MINUTES_MAX + 1}, (unused, minute) => ({value: pad(minute), label: pad(minute)}));

// Anything unparseable becomes midnight rather than an empty field, and a value
// out of range is clamped - the behaviour the old picker had.
export function splitTime(time) {
    const parts = String(time || '00:00').split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    return {
        hours: pad(Math.max(0, Math.min(HOURS_MAX, Number.isNaN(hours) ? 0 : hours))),
        minutes: pad(Math.max(0, Math.min(MINUTES_MAX, Number.isNaN(minutes) ? 0 : minutes))),
    };
}

// Controlled: what is shown comes from the `time` prop, and onChange fires only
// when the user picks something. Nothing is echoed back on mount.
function TimePicker({id, time, onChange, disabled = false, label = undefined}) {
    const {hours, minutes} = splitTime(time);
    const hoursLabel = label ? `${label}, hours` : 'Hours';
    const minutesLabel = label ? `${label}, minutes` : 'Minutes';

    return (
        <div className={'standup-time-picker'}>
            <Select
                id={`${id}-hours`}
                value={hours}
                options={HOURS}
                onChange={(value) => onChange(`${value}:${minutes}`)}
                disabled={disabled}
                ariaLabel={hoursLabel}
            />
            <span
                className={'standup-time-picker-separator'}
                aria-hidden={'true'}
            >
                {':'}
            </span>
            <Select
                id={`${id}-minutes`}
                value={minutes}
                options={MINUTES}
                onChange={(value) => onChange(`${hours}:${value}`)}
                disabled={disabled}
                ariaLabel={minutesLabel}
            />
        </div>
    );
}

TimePicker.propTypes = {
    id: PropTypes.string.isRequired,
    time: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    label: PropTypes.string,
};

export default TimePicker;
