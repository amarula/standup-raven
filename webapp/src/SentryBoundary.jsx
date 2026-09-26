import * as React from 'react';
import PropTypes from 'prop-types';
import * as Sentry from '@sentry/browser';
import './SentryBoundary.css';

// Catches a render error inside the plugin's own UI so it cannot take the rest
// of the web app down with it, reports it, and leaves something readable in its
// place.
//
// It has to be a parent of the components it guards. An error boundary never
// catches an error thrown by itself, so the arrangement this replaces - a
// component declared as `class X extends (SentryBoundary, React.Component)`,
// where the comma operator discards the boundary and only React.Component
// survives - could not have reported anything even if the mixin had been
// applied properly. Nothing here is a hook: the plugin renders under whichever
// React the host is running, and a class works on all of them.
class SentryBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {failed: false};
    }

    static getDerivedStateFromError() {
        return {failed: true};
    }

    componentDidCatch(error, errorInfo) {
        // A no-op unless the plugin's own error reporting is switched on and a
        // DSN was configured, which is the only case where this should go
        // anywhere.
        Sentry.withScope((scope) => {
            Object.keys(errorInfo).forEach((key) => {
                scope.setExtra(key, errorInfo[key]);
            });
            Sentry.captureException(error);
        });
    }

    reset = () => {
        this.setState({failed: false});
    };

    render() {
        if (!this.state.failed) {
            return this.props.children;
        }

        if (this.props.fallback) {
            return this.props.fallback;
        }

        return (
            <div
                className={'standup-plugin-error'}
                role={'alert'}
            >
                <p>{'Standup Raven ran into an unexpected error.'}</p>
                <button
                    type={'button'}
                    className={'standup-button standup-button-primary'}
                    onClick={this.reset}
                >
                    {'Try again'}
                </button>
            </div>
        );
    }
}

// Root components are rendered by the host, so an error thrown inside one would
// otherwise surface as a broken web app rather than as a broken plugin. The
// boundary goes above the component it guards: an error boundary never catches
// an error thrown by itself.
export function withBoundary(Component) {
    function Guarded(props) {
        return (
            <SentryBoundary>
                <Component {...props}/>
            </SentryBoundary>
        );
    }

    Guarded.displayName = `${Component.displayName || Component.name || 'Component'}WithBoundary`;

    return Guarded;
}

SentryBoundary.propTypes = {
    children: PropTypes.node,
    fallback: PropTypes.node,
};

SentryBoundary.defaultProps = {
    children: null,
    fallback: null,
};

export default SentryBoundary;
