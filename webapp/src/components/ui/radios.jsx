import * as React from 'react';
import PropTypes from 'prop-types';

// Native radios in a group: arrow keys move between them and announce the
// choice, which is behaviour no custom control here would improve on.
function Radios({name, value, options, onChange, disabled = false, ariaLabel = undefined}) {
    return (
        <div
            className={'standup-radios'}
            role={'radiogroup'}
            aria-label={ariaLabel}
        >
            {options.map((option) => (
                <label
                    key={option.value}
                    className={'standup-radio'}
                >
                    <input
                        type={'radio'}
                        className={'standup-radio-input'}
                        name={name}
                        value={option.value}
                        checked={option.value === value}
                        disabled={disabled}
                        onChange={() => onChange(option.value)}
                    />
                    <span className={'standup-radio-label'}>{option.label}</span>
                </label>
            ))}
        </div>
    );
}

Radios.propTypes = {
    name: PropTypes.string.isRequired,
    value: PropTypes.string,
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string.isRequired,
        label: PropTypes.node.isRequired,
    })).isRequired,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    ariaLabel: PropTypes.string,
};

export default Radios;
