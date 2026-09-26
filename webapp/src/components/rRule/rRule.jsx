import * as React from 'react';
import PropTypes from 'prop-types';
import {ControlLabel, FormGroup} from 'react-bootstrap';
import moment from 'moment';

import {DATE_TIME_FORMAT} from '../reactBootstrapRRuleGenerator/constants';
import RRuleGenerator from '../reactBootstrapRRuleGenerator';
import '../reactBootstrapRRuleGenerator/styles/index.css';

import './style.css';
import reactStyles from './style';

// The geometry this editor still lays itself out with, kept here rather than
// borrowed from the config modal's module: the modal no longer has inline
// styles to lend. Everything below is replaced when the editor is rebuilt on
// the kit.
const formRowStyle = {
    formGroup: {
        marginBottom: '20px',
        minHeight: '35px',
    },
    controlLabel: {
        paddingRight: '10px',
        width: '180px',
    },
};

class RRule extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = RRule.getInitialState();
    }

    static get frequencies() {
        return ['Monthly', 'Weekly'];
    }

    static getInitialState = () => {
        return {
            rrule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',
            startDate: new Date().toISOString(),
            startDateDisplay: new Date(),
        };
    };

    static getDerivedStateFromProps(nextProps, prevState) {
        // dont update state if nothing changed
        if (nextProps.rrule === prevState.rrule || nextProps.startDate === prevState.startDate) {
            return null;
        }

        return {
            rrule: nextProps.rrule || prevState.rrule,
            startDate: nextProps.startDate || prevState.startDate,
        };
    }

    componentDidMount() {
        this.sendChanges(this.state.rrule, this.state.startDate);
    }

    rruleChangeHandler = (rrule) => {
        this.setState({
            rrule,
        });

        this.sendChanges(rrule, this.state.startDate);
    };

    startDateChangeHandler = (event) => {
        // The input reports a YYYY-MM-DD date, while the plugin API further
        // down expects an ISO timestamp. Anchor it to UTC so that the date
        // picked is the date saved whatever the browser's timezone.
        const isoDate = moment.utc(event.target.value, DATE_TIME_FORMAT).toISOString();

        this.setState({
            startDate: isoDate,
        });

        this.sendChanges(this.state.rrule, isoDate);
    };

    sendChanges = (rrule, startaDate) => {
        this.props.onChange(rrule.replace('RRULE:', ''), startaDate);
    };

    render() {
        return (
            <div>
                <FormGroup style={formRowStyle.formGroup}>
                    <ControlLabel style={formRowStyle.controlLabel}>
                        {'Start Date:'}
                    </ControlLabel>
                    {/*TODO add local formatted date in value*/}
                    <div
                        className={'recurrence-start-date'}
                        style={reactStyles.getStyle().recurrenceDatepicker}
                    >
                        <input
                            type='date'
                            className='form-control'
                            id={'recurrence-start-date-picker'}
                            value={moment(this.state.startDate).format(DATE_TIME_FORMAT)}
                            onChange={this.startDateChangeHandler}
                        />
                    </div>
                </FormGroup>
                <FormGroup
                    style={formRowStyle.formGroup}
                    className={'standup-recurrence'}
                >
                    <RRuleGenerator
                        config={{
                            hideStart: true,
                            hideEnd: true,
                            repeat: RRule.frequencies,
                        }}
                        onChange={this.rruleChangeHandler}
                        value={this.state.rrule}
                        repeatDropdownStyle={{width: '300px'}}
                        weeklyFrequencyInputStyle={{width: '60px', textAlign: 'center'}}
                        monthlyFrequencyInputStyle={{width: '60px', textAlign: 'center'}}
                        monthlyOnDayDropdownStyle={{width: '300px'}}
                        monthlyOnTheDayDropdownStyle={{width: '120px'}}
                    />
                </FormGroup>
            </div>
        );
    }
}

RRule.propTypes = {
    rrule: PropTypes.string,
    startDate: PropTypes.string,
    onChange: PropTypes.func.isRequired,
};

export default RRule;
