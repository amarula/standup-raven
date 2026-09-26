import * as React from 'react';
import PropTypes from 'prop-types';
import {createPortal} from 'react-dom';
import ChevronDownIcon from '@mattermost/compass-icons/components/chevron-down';
import CheckIcon from '@mattermost/compass-icons/components/check';

// The menu is a listbox the popup owns, sized in fixed rows so a long list can
// be windowed: the timezone field carries 607 entries, and building them all on
// every render - which is what the modal used to do, even while closed - is the
// reason that row was slow.
const ROW_HEIGHT = 32;
const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 320;
const MIN_FLIP_SPACE = 200;
const WINDOW_THRESHOLD = 100;
const WINDOW_OVERSCAN = 5;
const TYPEAHEAD_RESET_MS = 500;

export function optionID(listID, option) {
    return `${listID}-option-${String(option.value).replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

function indexOfValue(options, value) {
    for (let index = 0; index < options.length; index++) {
        if (options[index].value === value) {
            return index;
        }
    }

    return -1;
}

// Case and separators are ignored, so "newyork" finds America/New_York.
function normalise(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function matches(label, query) {
    const needle = normalise(query);

    return !needle || normalise(label).indexOf(needle) >= 0;
}

// Fixed positioning against the trigger, flipping above it when the space below
// would clip the menu - the time pickers sit near the bottom of a short body.
function menuPosition(rect, maxHeight) {
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
    const spaceAbove = rect.top - MENU_GAP;
    const flip = spaceBelow < Math.min(maxHeight, MIN_FLIP_SPACE) && spaceAbove > spaceBelow;
    const available = flip ? spaceAbove : spaceBelow;
    const height = {maxHeight: Math.max(ROW_HEIGHT * 3, Math.min(maxHeight, available))};

    if (flip) {
        return {
            left: rect.left,
            width: rect.width,
            ...height,
            bottom: (window.innerHeight - rect.top) + MENU_GAP,
        };
    }

    return {
        left: rect.left,
        width: rect.width,
        ...height,
        top: rect.bottom + MENU_GAP,
    };
}

function Select({id, value, options, onChange, searchable = false, disabled = false, placeholder = '', ariaLabel = undefined, ariaDescribedBy = undefined, menuMaxHeight = MENU_MAX_HEIGHT}) {
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const [query, setQuery] = React.useState('');
    const [position, setPosition] = React.useState(null);
    const [scrollTop, setScrollTop] = React.useState(0);
    const triggerRef = React.useRef(null);
    const menuRef = React.useRef(null);
    const typeaheadRef = React.useRef({buffer: '', at: 0});

    const listID = `${id}-listbox`;
    const selectedIndex = indexOfValue(options, value);
    const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
    const filtered = React.useMemo(
        () => (searchable && query ? options.filter((option) => matches(option.label, query)) : options),
        [options, query, searchable],
    );

    const scrollToIndex = (index) => {
        const menu = menuRef.current;
        if (!menu) {
            return;
        }

        const top = index * ROW_HEIGHT;
        if (top < menu.scrollTop) {
            menu.scrollTop = top;
            setScrollTop(top);
        } else if (top + ROW_HEIGHT > menu.scrollTop + menu.clientHeight) {
            const next = (top + ROW_HEIGHT) - menu.clientHeight;
            menu.scrollTop = next;
            setScrollTop(next);
        }
    };

    const closeMenu = () => {
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
    };

    const openMenu = (index) => {
        const rect = triggerRef.current ? triggerRef.current.getBoundingClientRect() : null;
        setPosition(rect ? menuPosition(rect, menuMaxHeight) : null);
        setScrollTop(0);
        setActiveIndex(index);
        setOpen(true);
    };

    const commit = (index) => {
        const option = filtered[index];
        if (!option) {
            return;
        }

        onChange(option.value);
        closeMenu();
        if (triggerRef.current && triggerRef.current.focus) {
            triggerRef.current.focus();
        }
    };

    const step = (index) => {
        const next = Math.max(0, Math.min(filtered.length - 1, index));
        setActiveIndex(next);
        scrollToIndex(next);
    };

    // Repeated letters cycle through the entries that start with them, wrapping
    // and starting after the active one, which is the behaviour of a native
    // select.
    const jumpToTypeahead = (key) => {
        const now = Date.now();
        const previous = typeaheadRef.current;
        const buffer = now - previous.at > TYPEAHEAD_RESET_MS ? key : previous.buffer + key;
        typeaheadRef.current = {buffer, at: now};

        const needle = buffer.toLowerCase();
        for (let offset = 0; offset < filtered.length; offset++) {
            const index = (activeIndex + 1 + offset + filtered.length) % filtered.length;
            if (String(filtered[index].label).toLowerCase().indexOf(needle) === 0) {
                return index;
            }
        }

        return -1;
    };

    const handleKeyDown = (event) => {
        if (disabled) {
            return;
        }

        if (!open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openMenu(selectedIndex >= 0 ? selectedIndex : 0);
                return;
            }

            if (!searchable && event.key && event.key.length === 1 && event.key.trim()) {
                const index = jumpToTypeahead(event.key);
                if (index >= 0) {
                    event.preventDefault();
                    openMenu(index);
                }
            }

            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            step(activeIndex + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            step(activeIndex - 1);
        } else if (event.key === 'PageDown') {
            event.preventDefault();
            step(activeIndex + 10);
        } else if (event.key === 'PageUp') {
            event.preventDefault();
            step(activeIndex - 10);
        } else if (event.key === 'Home') {
            event.preventDefault();
            step(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            step(filtered.length - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            commit(activeIndex);
        } else if (event.key === 'Tab') {
            closeMenu();
        } else if (event.key === 'Escape') {
            // The menu is portalled, so React still bubbles this key to the
            // modal that owns us: stop it there or Escape would close both.
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
        }
    };

    // A click anywhere else, or any scroll of the page behind the menu, closes
    // it: the menu cannot follow its trigger once the page moves under it.
    React.useEffect(() => {
        if (!open) {
            return undefined;
        }

        const handleMouseDown = (event) => {
            const inTrigger = triggerRef.current && triggerRef.current.contains(event.target);
            const inMenu = menuRef.current && menuRef.current.contains(event.target);
            if (!inTrigger && !inMenu) {
                closeMenu();
            }
        };

        const handleScroll = (event) => {
            if (menuRef.current && menuRef.current.contains(event.target)) {
                return;
            }
            closeMenu();
        };

        document.addEventListener('mousedown', handleMouseDown, true);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', closeMenu);

        return () => {
            document.removeEventListener('mousedown', handleMouseDown, true);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', closeMenu);
        };
    }, [open]);

    const handleSearchChange = (event) => {
        setQuery(event.target.value);
        setActiveIndex(0);
        setScrollTop(0);
        if (menuRef.current) {
            menuRef.current.scrollTop = 0;
        }
    };

    const activeOption = activeIndex >= 0 ? filtered[activeIndex] : undefined;
    const activeDescendant = open && activeOption ? optionID(listID, activeOption) : undefined;

    // Closed, the field shows what is selected; open, it shows what has been
    // typed so far.
    let displayValue = selected ? selected.label : '';
    if (searchable && open) {
        displayValue = query;
    }

    const trigger = searchable ? (
        <input
            id={id}
            ref={triggerRef}
            type={'text'}
            role={'combobox'}
            className={'standup-control standup-select-input'}
            aria-autocomplete={'list'}
            aria-expanded={open}
            aria-controls={listID}
            aria-activedescendant={activeDescendant}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            autoComplete={'off'}
            spellCheck={false}
            value={displayValue}
            placeholder={placeholder}
            disabled={disabled}
            onClick={() => {
                if (!open) {
                    openMenu(selectedIndex >= 0 ? selectedIndex : 0);
                }
            }}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
        />
    ) : (
        <button
            id={id}
            ref={triggerRef}
            type={'button'}
            role={'combobox'}
            className={'standup-control standup-select-trigger'}
            aria-haspopup={'listbox'}
            aria-expanded={open}
            aria-controls={listID}
            aria-activedescendant={activeDescendant}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            disabled={disabled}
            onClick={() => (open ? closeMenu() : openMenu(selectedIndex >= 0 ? selectedIndex : 0))}
            onKeyDown={handleKeyDown}
        >
            <span className={`standup-select-value${selected ? '' : ' standup-select-placeholder'}`}>
                {selected ? selected.label : placeholder}
            </span>
            <ChevronDownIcon
                className={'standup-select-chevron'}
                size={18}
                aria-hidden={'true'}
            />
        </button>
    );

    const windowed = filtered.length > WINDOW_THRESHOLD;
    const firstVisible = windowed ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - WINDOW_OVERSCAN) : 0;
    const endVisible = windowed ?
        Math.min(filtered.length, Math.ceil((scrollTop + menuMaxHeight) / ROW_HEIGHT) + WINDOW_OVERSCAN) :
        filtered.length;
    const rows = filtered.slice(firstVisible, endVisible);
    const {maxHeight: measuredHeight, ...menuStyle} = position || {};
    const listMaxHeight = measuredHeight || menuMaxHeight;

    return (
        <div className={'standup-select'}>
            {trigger}
            {searchable ? (
                <ChevronDownIcon
                    className={'standup-select-chevron-decoration'}
                    size={18}
                    aria-hidden={'true'}
                />
            ) : null}
            {open && position ? createPortal(
                <div
                    ref={menuRef}
                    className={'standup-select-menu'}
                    style={menuStyle}
                >
                    <ul
                        id={listID}
                        role={'listbox'}
                        className={'standup-select-list'}
                        aria-label={ariaLabel}
                        style={{
                            // The list scrolls, not the box around it, so the
                            // height cap and the windowing spacers live here.
                            maxHeight: listMaxHeight,
                            paddingTop: firstVisible * ROW_HEIGHT,
                            paddingBottom: (filtered.length - endVisible) * ROW_HEIGHT,
                        }}
                        onScroll={(event) => setScrollTop(event.target.scrollTop)}
                    >
                        {rows.map((option, offset) => {
                            const index = firstVisible + offset;
                            const isSelected = option.value === value;

                            return (
                                <li
                                    key={option.value}
                                    id={optionID(listID, option)}
                                    role={'option'}
                                    data-index={index}
                                    aria-selected={isSelected}
                                    className={`standup-select-option${index === activeIndex ? ' standup-select-option-active' : ''}`}
                                    onMouseDown={(event) => {
                                        // Committing on mousedown, with the default
                                        // prevented, is what keeps focus on the
                                        // trigger while the click lands.
                                        event.preventDefault();
                                        commit(index);
                                    }}
                                    onMouseEnter={() => setActiveIndex(index)}
                                >
                                    <span className={'standup-select-option-label'}>{option.label}</span>
                                    {isSelected ? <CheckIcon size={16}/> : null}
                                </li>
                            );
                        })}
                    </ul>
                    {filtered.length === 0 ? (
                        <p className={'standup-select-empty'}>{'No matches'}</p>
                    ) : null}
                </div>,
                document.body,
            ) : null}
            {searchable && open ? (
                <span
                    className={'standup-visually-hidden'}
                    role={'status'}
                    aria-live={'polite'}
                >
                    {`${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'}`}
                </span>
            ) : null}
        </div>
    );
}

Select.propTypes = {
    id: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        label: PropTypes.node.isRequired,
    })).isRequired,
    onChange: PropTypes.func.isRequired,
    searchable: PropTypes.bool,
    disabled: PropTypes.bool,
    placeholder: PropTypes.string,
    ariaLabel: PropTypes.string,
    ariaDescribedBy: PropTypes.string,
    menuMaxHeight: PropTypes.number,
};

export default Select;
