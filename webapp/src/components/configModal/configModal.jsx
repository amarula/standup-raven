import * as React from 'react';
import PropTypes from 'prop-types';
import Cookies from 'js-cookie';
import * as HttpStatus from 'http-status-codes';
import request from 'superagent';

import utils from '../../utils';
import * as RavenClient from '../../raven-client';
import Constants from '../../constants';
import {TIMEZONE_OPTIONS} from '../../constants/timezones';
import {Alert, Button, Field, descriptionID, Modal, Select, Tabs, TextInput, Toggle} from '../ui';
import RRule from '../rRule';
import TimePicker from '../timePicker';
import {buildStandupConfigPayload} from './payload';
import './style.css';

const configModalCloseTimeout = 1000;

const REPORT_FORMAT_OPTIONS = [
    {value: 'user_aggregated', label: 'User Aggregated'},
    {value: 'type_aggregated', label: 'Type Aggregated'},
];

class ConfigModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = this.getInitialState();
    }

    getInitialState = () => {
        return {
            showSpinner: true,
            hasPermission: undefined,
            standupConfigured: null,
            windowOpenTime: '00:00',
            windowCloseTime: '00:00',
            reportFormat: 'user_aggregated',
            sections: {},
            members: [],
            enabled: true,
            windowOpenReminderEnabled: true,
            windowCloseReminderEnabled: true,
            timezone: '',
            scheduleEnabled: false,
            rruleString: '',
            startDate: new Date().toISOString(),
            activeTab: 'general',
            message: {
                show: false,
                text: '',
                type: 'info',
            },
            pluginConfig: {
                permissionSchemaEnabled: true,
            },
        };
    };

    componentDidUpdate(prevProp) {
        if (this.props.visible && !prevProp.visible) {
            Promise.all([this.getStandupConfig(), this.getPluginConfig()])
                .then(() => {
                    this.setState({showSpinner: false});
                })
                .catch(() => {
                    this.setState({showSpinner: false});
                });
        }
    }

    getStandupConfig = () => {
        return new Promise((resolve) => {
            const url = `${this.props.siteURL}/${Constants.URL_STANDUP_CONFIG}?channel_id=${this.props.channelID}`;
            request
                .get(url)
                .withCredentials()
                .end((err, result) => {
                    if (result.ok) {
                        const standupConfig = result.body;
                        const sections = {};
                        for (let i = 0; i < standupConfig.sections.length; ++i) {
                            sections[`line${i + 1}`] = standupConfig.sections[i];
                        }

                        this.setState({
                            windowOpenTime: standupConfig.windowOpenTime,
                            windowCloseTime: standupConfig.windowCloseTime,
                            reportFormat: standupConfig.reportFormat,
                            members: standupConfig.members,
                            sections,
                            enabled: standupConfig.enabled,
                            timezone: standupConfig.timezone,
                            windowOpenReminderEnabled: standupConfig.windowOpenReminderEnabled,
                            windowCloseReminderEnabled: standupConfig.windowCloseReminderEnabled,
                            scheduleEnabled: standupConfig.scheduleEnabled,
                            rruleString: standupConfig.rruleString,
                            startDate: standupConfig.startDate,
                            standupConfigured: true,
                        });
                    } else if (result.status === HttpStatus.NOT_FOUND) {
                        // The channel has no standup yet, so start from the
                        // server's own timezone rather than an empty field.
                        request
                            .get(`${this.props.siteURL}/${Constants.URL_GET_TIMEZONE}`)
                            .withCredentials()
                            .end((error, response) => {
                                if (response.ok) {
                                    this.setState({timezone: String(response.body)});
                                } else if (error) {
                                    console.error(error);
                                }
                            });
                    } else if (result.status === HttpStatus.UNAUTHORIZED) {
                        this.setState({hasPermission: false});
                    }

                    resolve();
                });
        });
    };

    getPluginConfig = () => {
        return RavenClient.Config.getPluginConfig(this.props.siteURL)
            .then((pluginConfig) => {
                // Without the permission schema everyone may configure a
                // channel; with it, only an effective channel admin may - and
                // guests never may.
                const allowed = pluginConfig.permissionSchemaEnabled ?
                    utils.isEffectiveChannelAdmin(this.props.userRoles) :
                    true;

                this.setState({
                    pluginConfig,
                    hasPermission: allowed && !this.props.isGuest,
                });
            })
            .catch((error) => {
                console.error(error);
            });
    };

    handleClose = () => {
        this.setState(this.getInitialState());
        this.props.close();
    };

    handleTabChange = (activeTab) => {
        this.setState({activeTab});
    };

    handleStatusChange = (enabled) => {
        this.setState({enabled});
    };

    handleScheduleStatusChange = (scheduleEnabled) => {
        this.setState({scheduleEnabled});
    };

    handleWindowOpenReminderChange = (windowOpenReminderEnabled) => {
        this.setState({windowOpenReminderEnabled});
    };

    handleWindowCloseReminderChange = (windowCloseReminderEnabled) => {
        this.setState({windowCloseReminderEnabled});
    };

    handleReportTypeChange = (reportFormat) => {
        this.setState({reportFormat});
    };

    handleTimezoneChange = (timezone) => {
        this.setState({timezone});
    };

    handleWindowOpenTimeChange = (windowOpenTime) => {
        this.setState({windowOpenTime});
    };

    handleWindowCloseTimeChange = (windowCloseTime) => {
        this.setState({windowCloseTime});
    };

    handleRecurrenceChange = (rruleString, startDate) => {
        this.setState({rruleString, startDate});
    };

    handleSectionChange = (event) => {
        const sections = {...this.state.sections};
        sections[event.target.name] = event.target.value;
        this.setState({sections});
    };

    saveStandupConfig = (event) => {
        event.preventDefault();

        // Hiding the message first so its animation re-triggers on the next one.
        this.setState({
            message: {
                show: false,
            },
        });

        request
            .post(`${this.props.siteURL}/${Constants.URL_STANDUP_CONFIG}?channel_id=${this.props.channelID}`)
            .withCredentials()
            .send(buildStandupConfigPayload(this.state, this.props.channelID))
            .set('X-CSRF-Token', Cookies.get(Constants.MATTERMOST_CSRF_COOKIE))
            .set('Content-Type', 'application/json')
            .end((err, res) => {
                if (err) {
                    this.setState({
                        message: {
                            show: true,
                            text: `An error occurred while saving standup config.\n${err.response.text}`,
                            type: 'danger',
                        },
                    });
                } else {
                    this.setState({
                        message: {
                            show: true,
                            text: 'Standup config saved successfully!',
                            type: 'success',
                        },
                    });
                    setTimeout(this.handleClose, configModalCloseTimeout);
                }
            });
    };

    renderSections() {
        // One row more than there are sections, so there is always somewhere to
        // type the next one.
        const rows = [];
        const count = Object.keys(this.state.sections).length;

        for (let i = 0; i <= count; ++i) {
            const name = `line${i + 1}`;
            rows.push(
                <TextInput
                    key={name}
                    id={`standup-section-${i + 1}`}
                    name={name}
                    prefix={`${i + 1}.`}
                    value={this.state.sections[name] || ''}
                    onChange={this.handleSectionChange}
                    disabled={!this.state.hasPermission}
                    placeholder={'What did you work on?'}
                    ariaLabel={`Standup section ${i + 1}`}
                />,
            );
        }

        return rows;
    }

    renderGeneralTab() {
        const disabled = !this.state.hasPermission;

        return (
            <React.Fragment>
                <Field
                    label={'Enabled'}
                    description={'Ask members of this channel to fill in a standup.'}
                    htmlFor={'standup-config-enabled'}
                    disabled={disabled}
                >
                    <Toggle
                        id={'standup-config-enabled'}
                        checked={this.state.enabled}
                        onChange={this.handleStatusChange}
                        disabled={disabled}
                    />
                </Field>
                <Field
                    label={'Standup Schedule'}
                    description={'Only collect standups on the days the schedule on the Schedule tab describes.'}
                    htmlFor={'standup-config-schedule-enabled'}
                    disabled={disabled}
                >
                    <Toggle
                        id={'standup-config-schedule-enabled'}
                        checked={this.state.scheduleEnabled}
                        onChange={this.handleScheduleStatusChange}
                        disabled={disabled}
                    />
                </Field>
                <Field
                    label={'Standup Report Format'}
                    description={'How each day\'s report groups what members wrote.'}
                    htmlFor={'standup-config-report-format'}
                    disabled={disabled}
                >
                    <Select
                        id={'standup-config-report-format'}
                        value={this.state.reportFormat}
                        options={REPORT_FORMAT_OPTIONS}
                        onChange={this.handleReportTypeChange}
                        disabled={disabled}
                        ariaDescribedBy={descriptionID('standup-config-report-format')}
                    />
                </Field>
                <Field
                    label={'Sections'}
                    description={'The prompts each member fills in, in the order they appear.'}
                    disabled={disabled}
                >
                    <div className={'standup-config-sections'}>
                        {this.renderSections()}
                    </div>
                </Field>
            </React.Fragment>
        );
    }

    renderNotificationsTab() {
        const disabled = !this.state.hasPermission;

        return (
            <React.Fragment>
                <Field
                    label={'Window Open Reminder'}
                    description={'Post a message in the channel when the standup window opens.'}
                    htmlFor={'standup-config-window-open-reminder'}
                    disabled={disabled}
                >
                    <Toggle
                        id={'standup-config-window-open-reminder'}
                        checked={this.state.windowOpenReminderEnabled}
                        onChange={this.handleWindowOpenReminderChange}
                        disabled={disabled}
                    />
                </Field>
                <Field
                    label={'Window Close Reminder'}
                    description={'Remind the members who have not submitted, shortly before the window closes.'}
                    htmlFor={'standup-config-window-close-reminder'}
                    disabled={disabled}
                >
                    <Toggle
                        id={'standup-config-window-close-reminder'}
                        checked={this.state.windowCloseReminderEnabled}
                        onChange={this.handleWindowCloseReminderChange}
                        disabled={disabled}
                    />
                </Field>
            </React.Fragment>
        );
    }

    renderScheduleTab() {
        const disabled = !this.state.hasPermission;

        return (
            <React.Fragment>
                <Field
                    label={'Window Time'}
                    description={'When the standup window opens and closes, in the timezone below.'}
                    htmlFor={'window-start-time-hours'}
                    disabled={disabled}
                >
                    <TimePicker
                        id={'window-start-time'}
                        time={this.state.windowOpenTime}
                        onChange={this.handleWindowOpenTimeChange}
                        disabled={disabled}
                        label={'Window opens'}
                    />
                    <span className={'standup-config-to'}>{'to'}</span>
                    <TimePicker
                        id={'window-end-time'}
                        time={this.state.windowCloseTime}
                        onChange={this.handleWindowCloseTimeChange}
                        disabled={disabled}
                        label={'Window closes'}
                    />
                </Field>
                <Field
                    label={'Timezone'}
                    description={'The timezone the window times are in.'}
                    htmlFor={'standup-config-timezone'}
                    disabled={disabled}
                >
                    <Select
                        id={'standup-config-timezone'}
                        value={this.state.timezone}
                        options={TIMEZONE_OPTIONS}
                        onChange={this.handleTimezoneChange}
                        disabled={disabled}
                        searchable={true}
                        ariaDescribedBy={descriptionID('standup-config-timezone')}
                    />
                </Field>
                <RRule
                    startDate={this.state.startDate}
                    rrule={this.state.rruleString}
                    onChange={this.handleRecurrenceChange}
                    disabled={disabled}
                />
            </React.Fragment>
        );
    }

    render() {
        const noPermission = !this.state.hasPermission;
        let readOnlyMessage = '';
        let readOnlyDetail = '';

        if (noPermission) {
            readOnlyMessage = 'Viewing configuration in read-only mode.';
            readOnlyDetail = this.props.isGuest ?
                'Guest users cannot update standup config' :
                'Only a channel admin can update the configuration.';
        }

        const permissionMissing = this.state.standupConfigured === false &&
            this.state.pluginConfig.permissionSchemaEnabled &&
            noPermission;

        const spinner = (
            <div className={'standup-config-spinner'}>
                <img
                    src={`${this.props.siteURL}/${Constants.URL_SPINNER_ICON}`}
                    alt={'loading...'}
                />
            </div>
        );

        const tabs = [
            {key: 'general', label: 'General', content: this.renderGeneralTab()},
            {key: 'notifications', label: 'Notifications', content: this.renderNotificationsTab()},
            {key: 'schedule', label: 'Schedule', content: this.renderScheduleTab()},
        ];

        // While loading, and when the channel has no standup and the viewer
        // could not create one anyway, there is nothing to save.
        let footer = null;
        if (!this.state.showSpinner && !permissionMissing) {
            footer = noPermission ? (
                <div className={'standup-config-readonly'}>
                    <span>{readOnlyMessage}</span>
                    <span>{readOnlyDetail}</span>
                </div>
            ) : (
                <React.Fragment>
                    <Button
                        variant={'tertiary'}
                        onClick={this.handleClose}
                    >
                        {'Cancel'}
                    </Button>
                    <Button
                        variant={'primary'}
                        onClick={this.saveStandupConfig}
                    >
                        {'Save'}
                    </Button>
                </React.Fragment>
            );
        }

        return (
            <Modal
                show={this.props.visible}
                onHide={this.handleClose}
                title={`${Constants.PLUGIN_DISPLAY_NAME} - Configure`}
                labelledBy={'standup-config-title'}
                footer={footer}
            >
                {this.state.showSpinner ? spinner : null}
                {!this.state.showSpinner && permissionMissing ? (
                    <div className={'standup-config-readonly'}>
                        <p>{'No standup configured for this channel'}</p>
                        <p>{'You do not have permission to setup Standup Raven. Please contact a system, team or channel admin to do so.'}</p>
                    </div>
                ) : null}
                {!this.state.showSpinner && !permissionMissing ? (
                    <React.Fragment>
                        {this.state.message.show ? (
                            <Alert variant={this.state.message.type}>
                                {this.state.message.text}
                            </Alert>
                        ) : null}
                        <Tabs
                            id={'standup-config-tabs'}
                            tabs={tabs}
                            activeKey={this.state.activeTab}
                            onChange={this.handleTabChange}
                            ariaLabel={'Standup configuration'}
                        />
                    </React.Fragment>
                ) : null}
            </Modal>
        );
    }
}

ConfigModal.propTypes = {
    channelID: PropTypes.string.isRequired,
    currentUserId: PropTypes.string.isRequired,
    userRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
    close: PropTypes.func.isRequired,
    visible: PropTypes.bool,
    siteURL: PropTypes.string.isRequired,
    isGuest: PropTypes.bool.isRequired,
};

ConfigModal.defaultProps = {
    visible: false,
};

export default ConfigModal;
