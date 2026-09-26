import React from 'react';
import PropTypes from 'prop-types';

import {DATE_TIME_FORMAT} from '../../constants/index';
import translateLabel from '../../utils/translateLabel';

const StartOnDate = ({
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
        'aria-label': translateLabel(translations, 'start.tooltip'),
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
                                    name: 'start.onDate.date',
                                },
                            };

                            handleChange(editedEvent);
                        }}
                    /> :
                    // A native date input rather than a picker component: the
                    // value handled here is already YYYY-MM-DD, and the pickers
                    // that were used before call ReactDOM.findDOMNode and
                    // createReactClass, both removed in React 19.
                    <input
                        type='date'
                        className='form-control'
                        id={`${id}-datetime`}
                        name='start.onDate.date'
                        aria-label={calendarAttributes['aria-label']}
                        value={date}
                        onChange={(event) => {
                            const editedEvent = {
                                target: {
                                    value: event.target.value,
                                    name: 'start.onDate.date',
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

StartOnDate.propTypes = {
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

export default StartOnDate;
