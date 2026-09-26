import * as React from 'react';
import PropTypes from 'prop-types';

// Work notes: the same surface as every other control, opened up. It is a plain
// textarea rather than anything cleverer because what goes in it is Markdown,
// and a rich editor would have to be taught to leave fenced code alone.
function Textarea({id, name = undefined, value, onChange, placeholder = undefined, disabled = false, ariaLabel = undefined, ariaDescribedBy = undefined, rows = 8}) {
    return (
        <textarea
            id={id}
            name={name}
            className={'standup-control standup-textarea'}
            rows={rows}
            value={value === null || value === undefined ? '' : value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
        />
    );
}

Textarea.propTypes = {
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    ariaLabel: PropTypes.string,
    ariaDescribedBy: PropTypes.string,
    rows: PropTypes.number,
};

export default Textarea;
