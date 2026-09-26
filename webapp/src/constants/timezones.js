import timezones from '../../../timezones.json';

// Built once, at module scope. The list holds 607 entries, and the modal used
// to rebuild a map of all of them on every property access and an element for
// every one of them on every render - including while the modal was closed.
//
// The empty timezone is offered as '-' because that is what an installation
// that has never set one stores, and because a select whose value is not among
// its options would otherwise have nothing to show for it.
export const TIMEZONE_OPTIONS = [
    {value: '', label: '-'},
    ...timezones.map((timezone) => ({value: timezone.value, label: timezone.display_name})),
];

export default TIMEZONE_OPTIONS;
