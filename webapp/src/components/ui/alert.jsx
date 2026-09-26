import * as React from 'react';
import PropTypes from 'prop-types';

// The message a modal leaves behind after saving or failing. `variant` used to
// arrive from a Bootstrap class name and could be undefined, which rendered a
// colourless box; here it always resolves to something.
function Alert({variant = 'info', children, className = ''}) {
    const role = variant === 'danger' || variant === 'warning' ? 'alert' : 'status';

    return (
        <div
            className={`standup-alert standup-alert-${variant} ${className}`.trim()}
            role={role}
        >
            {children}
        </div>
    );
}

Alert.propTypes = {
    variant: PropTypes.oneOf(['info', 'success', 'warning', 'danger']),
    children: PropTypes.node,
    className: PropTypes.string,
};

export default Alert;
