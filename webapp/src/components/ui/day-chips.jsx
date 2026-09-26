import * as React from 'react';
import PropTypes from 'prop-types';

// Checkbox chips. The input is a real checkbox that is only visually hidden, so
// Space toggles it and it takes focus; the chip is its label.
function DayChips({id, days, selected, onToggle, disabled = false, ariaLabel = undefined}) {
    return (
        <div
            id={id}
            className={'standup-chips'}
            role={'group'}
            aria-label={ariaLabel}
        >
            {days.map((day) => {
                const on = selected.indexOf(day.value) >= 0;

                return (
                    <label
                        key={day.value}
                        className={`standup-chip${on ? ' standup-chip-on' : ''}${disabled ? ' standup-chip-disabled' : ''}`}
                        htmlFor={`${id}-${day.value}`}
                    >
                        <input
                            id={`${id}-${day.value}`}
                            type={'checkbox'}
                            className={'standup-visually-hidden standup-chip-input'}
                            checked={on}
                            disabled={disabled}
                            onChange={() => onToggle(day.value)}
                        />
                        <span className={'standup-chip-label'}>{day.label}</span>
                    </label>
                );
            })}
        </div>
    );
}

DayChips.propTypes = {
    id: PropTypes.string.isRequired,
    days: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string.isRequired,
        label: PropTypes.node.isRequired,
    })).isRequired,
    selected: PropTypes.arrayOf(PropTypes.string).isRequired,
    onToggle: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    ariaLabel: PropTypes.string,
};

export default DayChips;
