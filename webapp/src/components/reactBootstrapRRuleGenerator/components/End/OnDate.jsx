import React from 'react';
import PropTypes from 'prop-types';

import {DATE_TIME_FORMAT} from '../../constants/index';
import translateLabel from '../../utils/translateLabel';

const EndOnDate = ({
    id,
    onDate: {
        date,
        options,
    },
    handleChange,
    translations,
}) => {
    const CustomCalendar = options.calendarComponent;

    const locale = options.weekStartsOnSunday ? 'en-ca' : 'en-gb';
    const calendarAttributes = {
        'aria-label': translateLabel(translations, 'end.tooltip'),
        value: date,
        dateFormat: DATE_TIME_FORMAT,
        locale,
        readOnly: true,
    };

    return (
        <div className='col-6 col-sm-3'>
            {
                CustomCalendar ?
                    <CustomCalendar
                        key={`${id}-calendar`}
                        {...calendarAttributes}
                        onChange={(event) => {
                            const editedEvent = {
                                target: {
                                    value: event.target.value,
                                    name: 'end.onDate.date',
                                },
                            };

                            handleChange(editedEvent);
                        }}
                    /> :
                    // See the note in Start/OnDate.jsx: a native date input
                    // replaces a picker that React 19 can no longer run.
                    <input
                        type='date'
                        className='form-control'
                        id={`${id}-datetime`}
                        name='end.onDate.date'
                        aria-label={calendarAttributes['aria-label']}
                        value={date}
                        onChange={(event) => {
                            const editedEvent = {
                                target: {
                                    value: event.target.value,
                                    name: 'end.onDate.date',
                                },
                            };

                            handleChange(editedEvent);
                        }}
                        required={true}
                    />
            }
        </div>
    );
};

EndOnDate.propTypes = {
    id: PropTypes.string.isRequired,
    onDate: PropTypes.shape({
        date: PropTypes.string.isRequired,
        options: PropTypes.shape({
            weekStartsOnSunday: PropTypes.bool,
            calendarComponent: PropTypes.oneOfType([PropTypes.element, PropTypes.func]),
        }).isRequired,
    }).isRequired,
    handleChange: PropTypes.func.isRequired,
    translations: PropTypes.oneOfType([PropTypes.object, PropTypes.func]).isRequired,
};

export default EndOnDate;
