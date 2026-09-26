// Stand-in for the component library the Mattermost web app provides.
//
// The plugin does not bundle react-bootstrap: webpack maps the import to the
// host's window.ReactBootstrap global. These are deliberately dumb pass-through
// elements, because the host's version is not what this test is about - what is
// under test is the plugin's own code running on React 19.
const React = require('react');

// The names the plugin imports from react-bootstrap. They are listed so that a
// bundler can see them (a Proxy on its own has no enumerable keys to copy), and
// a new import shows up here as an "Element type is invalid" failure.
const COMPONENTS = ['Alert', 'Button', 'ControlLabel', 'FormControl', 'FormGroup', 'InputGroup',
    'MenuItem', 'Modal', 'OverlayTrigger', 'SplitButton', 'Tooltip'];

const ALLOWED_PROPS = new Set(['className', 'style', 'id', 'name', 'type', 'value', 'defaultValue',
    'onChange', 'onClick', 'onBlur', 'disabled', 'href', 'title', 'role', 'htmlFor']);

function standIn(name) {
    const component = React.forwardRef(function StandIn(props, ref) {
        const passThrough = {};
        for (const [key, value] of Object.entries(props)) {
            if (key === 'children' || ALLOWED_PROPS.has(key) || key.startsWith('aria-') || key.startsWith('data-')) {
                passThrough[key] = value;
            }
        }
        return React.createElement('div', {...passThrough, ref}, props.children);
    });
    component.displayName = `StandIn(${name})`;
    return component;
}

const components = {};
for (const name of COMPONENTS) {
    components[name] = standIn(name);
}

module.exports = new Proxy(components, {
    get(target, name) {
        if (typeof name !== 'string' || name === 'default' || name === '__esModule' || name === 'then') {
            return target[name];
        }
        if (!target[name]) {
            target[name] = standIn(name);
        }
        return target[name];
    },
});
