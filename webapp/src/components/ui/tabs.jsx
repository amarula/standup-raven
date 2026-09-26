import * as React from 'react';
import PropTypes from 'prop-types';

// Every panel stays mounted and the inactive ones are hidden, so a tab's
// aria-controls always resolves to something and switching tabs cannot lose a
// half-typed value. Focus lands in the body of a hidden panel only if the panel
// is hidden, which the modal's focus trap filters out.
function Tabs({id, tabs, activeKey, onChange, ariaLabel = undefined}) {
    const handleKeyDown = (event) => {
        const keys = tabs.map((tab) => tab.key);
        const current = keys.indexOf(activeKey);
        const last = keys.length - 1;
        let next;

        if (event.key === 'ArrowRight') {
            next = current === last ? keys[0] : keys[current + 1];
        } else if (event.key === 'ArrowLeft') {
            next = current === 0 ? keys[last] : keys[current - 1];
        } else if (event.key === 'Home') {
            next = keys[0];
        } else if (event.key === 'End') {
            next = keys[last];
        } else {
            return;
        }

        event.preventDefault();
        onChange(next);

        // Focus follows the selection, which is what makes the arrow keys feel
        // like the tabs they are.
        const element = document.getElementById(`${id}-tab-${next}`);
        if (element) {
            element.focus();
        }
    };

    return (
        <div className={'standup-tabs'}>
            <div
                className={'standup-tablist'}
                role={'tablist'}
                aria-label={ariaLabel}
                onKeyDown={handleKeyDown}
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        id={`${id}-tab-${tab.key}`}
                        type={'button'}
                        role={'tab'}
                        className={'standup-tab'}
                        aria-selected={tab.key === activeKey}
                        aria-controls={`${id}-panel-${tab.key}`}
                        tabIndex={tab.key === activeKey ? 0 : -1}
                        onClick={() => onChange(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            {tabs.map((tab) => (
                <div
                    key={tab.key}
                    id={`${id}-panel-${tab.key}`}
                    className={'standup-tabpanel'}
                    role={'tabpanel'}
                    aria-labelledby={`${id}-tab-${tab.key}`}
                    hidden={tab.key !== activeKey}

                    // Both, deliberately. The attribute says what this is to a
                    // screen reader and lets the focus trap skip it, but it only
                    // hides anything through the user agent's own stylesheet,
                    // which any rule of ours outranks. The inline style cannot be
                    // outranked, so a stray `display` rule in the kit can never
                    // show every tab at once again.
                    style={tab.key === activeKey ? undefined : {display: 'none'}}
                >
                    {tab.content}
                </div>
            ))}
        </div>
    );
}

Tabs.propTypes = {
    id: PropTypes.string.isRequired,
    tabs: PropTypes.arrayOf(PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.node.isRequired,
        content: PropTypes.node,
    })).isRequired,
    activeKey: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    ariaLabel: PropTypes.string,
};

export default Tabs;
