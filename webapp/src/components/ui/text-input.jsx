import * as React from 'react';
import PropTypes from 'prop-types';

// `prefix` draws the "1." that numbers a section row, inside the input's own
// border so the numbering cannot drift away from the field it belongs to.
function TextInput({id, name = undefined, value, onChange, type = 'text', prefix = null, placeholder = undefined, disabled = false, ariaLabel = undefined, ariaDescribedBy = undefined, min = undefined, max = undefined, className = ''}) {
    const input = (
        <input
            id={id}
            name={name}
            className={`standup-control standup-input ${className}`.trim()}
            type={type}
            value={value === null || value === undefined ? '' : value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            min={min}
            max={max}
        />
    );

    if (!prefix) {
        return input;
    }

    return (
        <div className={'standup-input-group'}>
            <span
                className={'standup-input-prefix'}
                aria-hidden={'true'}
            >
                {prefix}
            </span>
            {input}
        </div>
    );
}

TextInput.propTypes = {
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onChange: PropTypes.func.isRequired,
    type: PropTypes.string,
    prefix: PropTypes.node,
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    ariaLabel: PropTypes.string,
    ariaDescribedBy: PropTypes.string,
    min: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    max: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    className: PropTypes.string,
};

export default TextInput;
