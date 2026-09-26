import * as React from 'react';
import PropTypes from 'prop-types';

// A real checkbox under the skin. That is where the keyboard path comes from -
// Space toggles it and it leaves the tab order when disabled - and it is why
// onChange receives the value it should now have rather than a toggle request,
// which is what removes the "fires twice, lands where it started" bug.
function Toggle({id, checked, onChange, disabled = false, label = null}) {
    const handleChange = (event) => {
        onChange(event.target.checked);
    };

    const control = (
        <span className={'standup-toggle'}>
            <input
                id={id}
                type={'checkbox'}
                role={'switch'}
                className={'standup-toggle-input'}
                checked={checked}
                disabled={disabled}
                onChange={handleChange}
            />
            <span
                className={'standup-toggle-track'}
                aria-hidden={'true'}
            >
                <span className={'standup-toggle-handle'}/>
            </span>
        </span>
    );

    if (!label) {
        return control;
    }

    return (
        <label
            className={'standup-toggle-label'}
            htmlFor={id}
        >
            {control}
            <span className={'standup-toggle-text'}>{label}</span>
        </label>
    );
}

Toggle.propTypes = {
    id: PropTypes.string.isRequired,
    checked: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    label: PropTypes.node,
};

export default Toggle;
