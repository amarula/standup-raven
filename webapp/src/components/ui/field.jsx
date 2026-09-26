import * as React from 'react';
import PropTypes from 'prop-types';

// The System Console row: the setting's name, a line explaining it, then the
// control. Every row in the plugin's modals is one of these, so they all share
// one left edge and one rhythm.
function Field({label, description = null, htmlFor = undefined, disabled = false, children = null}) {
    return (
        <div className={`standup-field${disabled ? ' standup-field-disabled' : ''}`}>
            <label
                className={'standup-field-label'}
                htmlFor={htmlFor}
            >
                {label}
            </label>
            {description ? (
                <p
                    className={'standup-field-description'}
                    id={descriptionID(htmlFor)}
                >
                    {description}
                </p>
            ) : null}
            <div className={'standup-field-control'}>
                {children}
            </div>
        </div>
    );
}

// A control that wants to be described by its row's description points at this
// id, so the two can never drift apart.
export function descriptionID(controlID) {
    return controlID ? `${controlID}-description` : undefined;
}

Field.propTypes = {
    label: PropTypes.node.isRequired,
    description: PropTypes.node,
    htmlFor: PropTypes.string,
    disabled: PropTypes.bool,
    children: PropTypes.node,
};

export default Field;
