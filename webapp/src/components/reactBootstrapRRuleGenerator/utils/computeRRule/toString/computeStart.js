import moment from 'moment';

const computeStart = ({onDate: {date}}) => {
    // moment() always returns a moment, so the previous check,
    // moment.isMoment(moment(date)), always passed and the picked date was
    // thrown away in favour of the current time. Check the parsed date instead,
    // keeping the "now" fallback for a date that cannot be used.
    const start = moment(date);

    return {
        dtstart: (start.isValid() ? start : moment()).toDate(),
    };
};

export default computeStart;
