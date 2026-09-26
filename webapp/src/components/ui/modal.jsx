import * as React from 'react';
import PropTypes from 'prop-types';
import {createPortal} from 'react-dom';
import CloseIcon from '@mattermost/compass-icons/components/close';

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Anything that opens a popup inside a dialog portals it here rather than into
// the body. A dialog and a popup portalled to the body are siblings in the
// same stacking context, so which one wins is decided by z-index numbers - and
// the ones Mattermost publishes were not always published: on a server that has
// no --z-index-menu, a popup falls back to a number below the dialog's and
// opens behind it, which looks exactly like a menu that never opened.
export const ModalContext = React.createContext(null);

// Focusable elements inside `container`, skipping anything inside a hidden tab
// panel. Filtering on the [hidden] attribute rather than on measured geometry
// is deliberate: it is what a browser enforces anyway, and it is the only thing
// that works in a DOM without layout.
export function focusableWithin(container) {
    if (!container) {
        return [];
    }

    return Array.prototype.slice.
        call(container.querySelectorAll(focusableSelector)).
        filter((element) => !element.closest('[hidden]'));
}

// The plugin's own dialog. Mattermost's theme variables are defined on :root
// and written there by the theme, so portalling to document.body still inherits
// every one of them.
function Modal({show, onHide, title, labelledBy, closeLabel = 'Close', className = '', children, footer = null}) {
    const dialogRef = React.useRef(null);
    const restoreFocusRef = React.useRef(null);

    // The dialog element, in state rather than only in a ref, so that popups
    // rendered by anything inside the modal can be portalled into it.
    const [dialogElement, setDialogElement] = React.useState(null);
    const attachDialog = React.useCallback((element) => {
        dialogRef.current = element;
        setDialogElement(element);
    }, []);

    React.useEffect(() => {
        if (!show) {
            return undefined;
        }

        restoreFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // The dialog takes focus rather than its first control: focusing the
        // close button would put Enter one keystroke away from dismissing the
        // form the user just opened.
        if (dialogRef.current) {
            dialogRef.current.focus();
        }

        return () => {
            document.body.style.overflow = previousOverflow;

            const target = restoreFocusRef.current;
            if (target && target.isConnected && target.focus) {
                target.focus();
            }
        };
    }, [show]);

    const handleKeyDown = (event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
            event.stopPropagation();
            onHide();
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const focusable = focusableWithin(dialogRef.current);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || active === dialogRef.current)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    };

    if (!show) {
        return null;
    }

    return createPortal(
        <div className={`standup-modal ${className}`.trim()}>
            <div
                className={'standup-modal-backdrop'}
                aria-hidden={'true'}
            />
            <div
                className={'standup-modal-dialog'}
                role={'dialog'}
                aria-modal={'true'}
                aria-labelledby={labelledBy}
                tabIndex={-1}
                ref={attachDialog}
                onKeyDown={handleKeyDown}
            >
                <div className={'standup-modal-header'}>
                    <h1
                        className={'standup-modal-title'}
                        id={labelledBy}
                    >
                        {title}
                    </h1>
                    <button
                        type={'button'}
                        className={'standup-modal-close'}
                        aria-label={closeLabel}
                        onClick={onHide}
                    >
                        <CloseIcon size={20}/>
                    </button>
                </div>
                <ModalContext.Provider value={dialogElement}>
                    <div className={'standup-modal-body'}>
                        {children}
                    </div>
                </ModalContext.Provider>
                {footer ? (
                    <div className={'standup-modal-footer'}>
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

Modal.propTypes = {
    show: PropTypes.bool.isRequired,
    onHide: PropTypes.func.isRequired,
    title: PropTypes.node.isRequired,
    labelledBy: PropTypes.string.isRequired,
    closeLabel: PropTypes.string,
    className: PropTypes.string,
    children: PropTypes.node,
    footer: PropTypes.node,
};

export default Modal;
