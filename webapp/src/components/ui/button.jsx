import * as React from 'react';
import PropTypes from 'prop-types';

function Button({variant = 'tertiary', type = 'button', onClick = undefined, disabled = false, id = undefined, ariaLabel = undefined, children}) {
    return (
        <button
            id={id}
            type={type}
            className={`standup-button standup-button-${variant}`}
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
        >
            {children}
        </button>
    );
}

Button.propTypes = {
    variant: PropTypes.oneOf(['primary', 'tertiary', 'danger']),
    type: PropTypes.oneOf(['button', 'submit', 'reset']),
    onClick: PropTypes.func,
    disabled: PropTypes.bool,
    id: PropTypes.string,
    ariaLabel: PropTypes.string,
    children: PropTypes.node.isRequired,
};

export default Button;
