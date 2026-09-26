import * as React from 'react';
import PropTypes from 'prop-types';
import request from 'superagent';
import * as HttpStatus from 'http-status-codes';
import Cookies from 'js-cookie';
import ChevronLeftIcon from '@mattermost/compass-icons/components/chevron-left';
import ChevronRightIcon from '@mattermost/compass-icons/components/chevron-right';

import Constants from '../../constants';
import {Alert, Button, Modal, Textarea, TextInput} from '../ui';
import {buildUserStandupPayload} from './payload';
import './style.css';

const {formatText, messageHtmlToComponent} = window.PostUtils;

const standupModalCloseTimeout = 1000;

class StandupModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = StandupModal.getInitialState();
    }

    static getInitialState() {
        return {
            standup: {},
            activeTab: '',
            message: {
                show: false,
                text: '',
                type: 'info',
            },
            showSpinner: true,
            standupConfig: undefined,
        };
    }

    componentDidUpdate(prevProp) {
        if (this.props.visible && !prevProp.visible) {
            this.getStandupConfig().
                then(this.getUserStandup).
                then(() => {
                    this.setState({showSpinner: false});
                }).
                catch(() => {
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
                        const standup = {};
                        result.body.sections.forEach((section) => {
                            standup[section] = {};
                        });

                        this.setState({
                            standupConfig: result.body,
                            activeTab: result.body.sections[0],
                            standup,
                        });
                    } else if (result.status !== HttpStatus.NOT_FOUND) {
                        console.error(err);
                    }
                    resolve();
                });
        });
    };

    getUserStandup = () => {
        return new Promise((resolve) => {
            request
                .get(`${this.props.siteURL}/${Constants.URL_SUBMIT_USER_STANDUP}?channel_id=${this.props.channelID}`)
                .withCredentials()
                .end((err, result) => {
                    if (result.ok) {
                        // Whatever was filed earlier today comes back as the
                        // starting point, so a member can add to it.
                        const standup = {...this.state.standup};
                        for (const sectionTitle of Object.keys(result.body.standup)) {
                            if (!standup[sectionTitle]) {
                                continue;
                            }

                            const lines = result.body.standup[sectionTitle];
                            const sectionType = this.sectionType(sectionTitle);

                            if (sectionType === Constants.SECTION_TYPES.LONG_TEXT) {
                                standup[sectionTitle] = {line1: lines.join('\n')};
                            } else if (sectionType === Constants.SECTION_TYPES.ISSUES) {
                                standup[sectionTitle] = {line1: lines.join(', ')};
                            } else {
                                lines.forEach((line, index) => {
                                    standup[sectionTitle][`line${index + 1}`] = line;
                                });
                            }
                        }
                        this.setState({standup});
                    } else if (result.status !== HttpStatus.NOT_FOUND) {
                        console.error(err);
                    }
                    resolve();
                });
        });
    };

    sectionType(sectionTitle) {
        const sectionTypes = (this.state.standupConfig && this.state.standupConfig.sectionTypes) || {};

        return sectionTypes[sectionTitle] || Constants.SECTION_TYPES.TEXT;
    }

    handleTasks = (sectionTitle, event) => {
        const standup = {...this.state.standup};
        standup[sectionTitle] = {...standup[sectionTitle], [event.target.name]: event.target.value};
        this.setState({standup});
    };

    handleClose = () => {
        this.setState(StandupModal.getInitialState());
        this.props.close();
    };

    handleSubmit = (event) => {
        event.preventDefault();

        request
            .post(`${this.props.siteURL}/${Constants.URL_SUBMIT_USER_STANDUP}?channel_id=${this.props.channelID}`)
            .withCredentials()
            .send(buildUserStandupPayload(this.state, this.props.channelID, (this.state.standupConfig || {}).sectionTypes))
            .set('X-CSRF-Token', Cookies.get(Constants.MATTERMOST_CSRF_COOKIE))
            .set('Content-Type', 'application/json')
            .end((err, res) => {
                if (err) {
                    this.setState({
                        message: {
                            show: true,
                            text: `An error occurred while submitting standup.\n${err.response.text}`,
                            type: 'danger',
                        },
                    });
                } else {
                    this.setState({
                        message: {
                            show: true,
                            text: 'Standup submitted successfully!',
                            type: 'success',
                        },
                    });
                    setTimeout(this.handleClose, standupModalCloseTimeout);
                }
            });
    };

    switchTabs = (direction) => {
        const sections = this.state.standupConfig.sections;
        const index = sections.indexOf(this.state.activeTab);
        const next = direction === 'forward' ? sections[index + 1] : sections[index - 1];

        if (next) {
            this.setState({activeTab: next});
        }
    };

    renderSection(sectionTitle) {
        const sectionType = this.sectionType(sectionTitle);

        if (sectionType === Constants.SECTION_TYPES.LONG_TEXT) {
            return (
                <Textarea
                    id={`standup-notes-${sectionTitle}`}
                    name={'line1'}
                    value={(this.state.standup[sectionTitle] || {}).line1 || ''}
                    onChange={(event) => this.handleTasks(sectionTitle, event)}
                    placeholder={'Anything worth writing down: test results, commands, log excerpts, links.'}
                    ariaLabel={sectionTitle}
                />
            );
        }

        if (sectionType === Constants.SECTION_TYPES.ISSUES) {
            return (
                <TextInput
                    id={`standup-issues-${sectionTitle}`}
                    name={'line1'}
                    value={(this.state.standup[sectionTitle] || {}).line1 || ''}
                    onChange={(event) => this.handleTasks(sectionTitle, event)}
                    placeholder={'AXELERA-210, AXELERA-183'}
                    ariaLabel={sectionTitle}
                />
            );
        }

        return this.renderRows(sectionTitle);
    }

    // One row more than there is anything to say, so there is always somewhere
    // to type the next line.
    renderRows(sectionTitle) {
        const lines = this.state.standup[sectionTitle] || {};
        const rows = [];

        for (let i = 0; i <= Object.keys(lines).length; ++i) {
            const name = `line${i + 1}`;

            rows.push(
                <TextInput
                    key={name}
                    id={`standup-${sectionTitle}-${name}`}
                    name={name}
                    prefix={`${i + 1}.`}
                    value={lines[name] || ''}
                    onChange={(event) => this.handleTasks(sectionTitle, event)}
                    ariaLabel={`${sectionTitle} line ${i + 1}`}
                    className={'standup-modal-line'}
                />,
            );
        }

        return rows;
    }

    renderError() {
        const config = this.state.standupConfig;

        if (!config) {
            return [
                'Standup is not configured for this channel.',
                'Make sure you are filling the standup in the right channel or that standup has been configured in this channel.',
            ];
        }

        if (!config.enabled) {
            return [
                'Standup is disabled for this channel.',
                'Please enable standup to continue using the features.',
            ];
        }

        if (!config.members || config.members.length === 0) {
            return [
                'No members configured for this channel\'s standup.',
                'Please add some members to the standup to continue using the features.',
            ];
        }

        if (config.members.indexOf(this.props.currentUserId) < 0) {
            return [
                'You are not a part of this channel\'s standup.',
                'Make sure you are filling standup in the right channel or that you were correctly added to the channel\'s standup.',
            ];
        }

        if (this.props.isGuest) {
            return [
                'You are not allowed to submit standup.',
                'Guest users are not allowed to submit standup.',
            ];
        }

        return null;
    }

    render() {
        const {standupConfig, activeTab, showSpinner} = this.state;
        const error = this.renderError();
        const showForm = !error && standupConfig !== undefined;

        const sections = standupConfig ? standupConfig.sections : [];
        const firstSection = sections[0];
        const lastSection = sections[sections.length - 1];
        const onLastSection = activeTab === lastSection;

        let footer = null;
        if (showForm) {
            footer = (
                <React.Fragment>
                    <Button
                        variant={'tertiary'}
                        onClick={this.handleClose}
                    >
                        {'Cancel'}
                    </Button>
                    <Button
                        variant={'primary'}
                        onClick={this.handleSubmit}
                        disabled={!onLastSection}
                    >
                        {'Submit'}
                    </Button>
                </React.Fragment>
            );
        }

        return (
            <Modal
                show={this.props.visible}
                onHide={this.handleClose}
                title={Constants.PLUGIN_DISPLAY_NAME}
                labelledBy={'standup-modal-title'}
                footer={footer}
            >
                {showSpinner ? (
                    <div className={'standup-modal-spinner'}>
                        <img
                            src={`${this.props.siteURL}/${Constants.URL_SPINNER_ICON}`}
                            alt={'loading...'}
                        />
                    </div>
                ) : null}

                {!showSpinner && error ? (
                    <div className={'standup-modal-error'}>
                        <p className={'standup-modal-error-message'}>{error[0]}</p>
                        <p>{error[1]}</p>
                    </div>
                ) : null}

                {!showSpinner && showForm ? (
                    <React.Fragment>
                        {this.state.message.show ? (
                            <Alert variant={this.state.message.type}>
                                {this.state.message.text}
                            </Alert>
                        ) : null}
                        <h2 className={'standup-modal-section'}>
                            {messageHtmlToComponent(formatText(activeTab))}
                        </h2>
                        <div className={'standup-modal-lines'}>
                            {this.renderSection(activeTab)}
                        </div>
                        <div className={'standup-modal-nav'}>
                            <Button
                                variant={'primary'}
                                onClick={() => this.switchTabs('backward')}
                                disabled={activeTab === firstSection}
                                ariaLabel={'Previous section'}
                            >
                                <ChevronLeftIcon size={20}/>
                            </Button>
                            <Button
                                variant={'primary'}
                                onClick={() => this.switchTabs('forward')}
                                disabled={onLastSection}
                                ariaLabel={'Next section'}
                            >
                                <ChevronRightIcon size={20}/>
                            </Button>
                            {!onLastSection ? (
                                <span className={'standup-modal-hint'}>
                                    {'Move to the last section to submit.'}
                                </span>
                            ) : null}
                        </div>
                    </React.Fragment>
                ) : null}
            </Modal>
        );
    }
}

StandupModal.propTypes = {
    channelID: PropTypes.string.isRequired,
    currentUserId: PropTypes.string.isRequired,
    close: PropTypes.func.isRequired,
    visible: PropTypes.bool.isRequired,
    siteURL: PropTypes.string.isRequired,
    isGuest: PropTypes.bool.isRequired,
};

export default StandupModal;
