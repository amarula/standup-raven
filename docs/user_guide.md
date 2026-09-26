<img src="assets/images/banner.png" width="300px">

#

## 👩‍💼 User Guide

Once the plugin is installed in your Mattermost instance, enabling teams to use it is super easy.
Just follow these steps and you'll be ready in no time.

1. **Creating channels for standup** - Create a new channel, or use an existing one, for each team that wants to use Standup Raven for their standup.

1. **Configuring channel standup** - For each channel, any member can enter configurations for the channel standup. If you are on Mattermost Enterprise Edition and have *Permission Schema* enabled, only a channel admin, team admin or system admin can perform this operation.
    
    Running the following slash command allows specifying team specific settings -
    
        /standup config
        
    In the dialog box presented, the following settings are required -
    
    * **Status** - `Enabled` to enable standup for your channel or `Disable` to disable it.
    
    * **Window open time** - The time at which standup reminders will be sent in the channel.
    
    * **Window close time** - The time at which an automated standup report will be sent in the channel. The report
    will include standups for all members who have filled their standups until this time.
    An additional reminder notification is sent in the channel at 80% completion of the window duration.
    This message tags those members who have not yet filled their standups.
    
    * **Timezone** - Channel specific timezone to follow for standup notifications.
    
    * **Window Open Reminder** - Enable or disable the window open reminder.
    
    * **Window Close Reminder** - Enable or disable the window close reminder.
     
    * **Sections** - Sections define the types of tasks that the users will fill in their standup.
    For example, if your team fills their standup at the beginning of their work day, suggested sections would be
    `Yesterday`, `Today` and maybe `Blockers`.
        
        Each section also says what kind of answer it wants:

        * **Text** (the default) - the question is answered in as many lines as you like, each one a row
          in the standup modal.
        * **Long text** - one large box for work notes: test results, commands, log excerpts, links.
          It takes Markdown, including fenced code blocks, and is stored exactly as written.
        * **Issue IDs** - one or more tracker issue IDs, such as `AXELERA-210, AXELERA-183`. They are
          stored uppercased and deduplicated, and the weekly digest groups the week by them.

        At least one section is required to be specified.
        
1. **Saving standup config** - Save the standup config that you filled.

1. **Adding standup members** - The following slash command allows you to add members to the channel standup -

        /standup addmembers
        
    You can specify multiple members together, separated by a space. Members who are not present in the channel will
    be automatically added to the channel as well.

1. **Removing standup members** - The following slash command removes members from the channel standup -

        /standup removemembers [username 1] [username 2]...

    Members are not removed from the channel itself. If a member's account has since been deactivated or deleted,
    the command cannot find it by username; the standup drops such members on its own the next time it builds a
    report, or they can be removed by their user ID.
    
1. **Filling your standup** - Once all the configuration is complete, click on the Standup Raven button in
    channel header to bring up a modal for filling out your standup.
    
    Once saved, you can click on the Standup Raven button again to bring back your filled standup, allowing you
    to make updates to it.

1. **Adding to your standup without the modal** - The following slash command adds a line to one section of
   today's standup, keeping whatever is already there -

        /standup update <section> <what you want to record>

    For example, `/standup update today reviewing the login fix`. As you type, the channel's own sections are
    offered as suggestions, so there is nothing to memorise; running the command with no section at all lists
    them. Section names are matched against the sections configured for the channel, ignoring case, and a name
    that contains spaces can be quoted: `/standup update "in progress" waiting on the API`. The command replies
    with the section as it now reads.

1. **Looking back over the week** - The following slash command shows the week's standups grouped by
   the issues they name, so the work can be copied into a tracker's work log -

        /standup week [weeks]

    With no argument it shows the week containing today, Monday to Sunday in the channel's timezone.
    `/standup week 1` shows the week before, which is what you want on a Monday morning. Only you see
    the reply. An entry that names several issues is listed under each of them; work that named no issue
    is grouped at the end under *Not tied to an issue*, so it is visible rather than missing. A week too
    long for one message is sent as several replies rather than cut short.

1. **Members who are away** - A standup report marks members whose Mattermost status is *Out Of Office*
    separately, so they are not listed among those who have not submitted. This can be turned off in the
    plugin's system console settings.

1. **Items that have not moved** - When what looks like the same item appears under the same section for
    three days running, Standup Raven sends that member a direct message asking whether it is stuck, and
    shows the command that adds it to today's standup. Wording can change between days: lines are compared
    by the words they have in common, so "waiting on the API team" and "API team still not responding"
    count as the same item, while different pull request numbers do not. Items described in entirely
    different words are not recognised. Nobody is asked more than once a week per channel, and the
    behaviour can be turned off in the plugin's system console settings.

     
