# Standup Raven — Feature Proposals

Proposals for making standups faster to file, quieter in channels, and more
useful to the people who read them. Grouped into five areas.

## PM Workflow & Issue Tracker Transfer

**The current priority.** The aim is to carry the work log a developer would
otherwise write twice — once for the team, once in YouTrack — so that what is
written for the standup is directly usable when the week's work is logged
against tickets.

In order: the details field, then the related issues, then the connection to
YouTrack that puts them to work. The weekly report follows from that, and is
described last because it is what changes once the rest exists.

The workflow this serves:

* **Daily** — the developer fills in Raven as they do now.
* **End of week** — they review the week's entries and log the real work, with
  hours, against the relevant YouTrack tickets.
* **PM** — checks the hours and updates the project budget and forecast.

The fields stay as they are, apart from the two additions below:

* **Required** — what you worked on yesterday, what you are planning today.
* **Optional** — what is blocking you; details / work notes; related YouTrack
  issues.

### Details / work notes field

An optional field, larger than the others and multiline, for the technical detail
a developer would actually want to share: test results, commands, log excerpts,
findings, references. It should take plain text, Markdown and fenced code blocks,
and it should stay optional so that an ordinary standup still takes very little
time to file.

There is a good example of what this looks like when it is done well in the
YouTrack hour descriptions we already write — [AXELERA-183, with the week's notes
and logs at the
end](https://youtrack.amarulasolutions.com/issue/AXELERA-183/Add-open-source-support-for-Antelao-board).
If we want developers to share work logs and write detailed progress, the
standup has to be somewhere that detail can be written, and it has to be
practical to reuse — otherwise we are asking them to write everything twice, and
they will write it once, in whichever place costs less.

### Related YouTrack issue(s)

One or more issue IDs on a standup entry, `AXELERA-210` for instance. This is what
makes the weekly transfer mechanical rather than a memory exercise: the week's
entries can be read back per issue, instead of being searched for by hand or
reconstructed from the channel.

### YouTrack REST integration

Rather than exporting the week and re-typing it, the plugin talks to YouTrack
directly.

* **Global configuration.** A system admin sets the YouTrack base URL and a token
  in Raven's own settings, in the System Console.
* **Per standup.** Each channel's standup is connected to one YouTrack project,
  chosen from the projects that token can see.
* **Reading issues.** The plugin can list that project's issues, and that is what
  makes the related-issues field usable rather than a free-text guess: suggest
  while the ID is being typed, and refuse one that does not exist.
* **Per developer.** Each member connects their own YouTrack account to their
  Mattermost account once, so that what they write is attributed to them in
  YouTrack rather than to the plugin.
* **Writing back.** Notes written on a standup entry are sent to the issues that
  entry names, so the same text does not have to be written twice.

This is what the two fields above are for. The related-issues field is what says
where the notes go, and the details field is what makes them worth sending.

### Weekly report and export

A weekly view of the channel's standups, grouped by issue and exportable, so a
developer can work through it while filling in the YouTrack work log.

With the integration above in place, this changes character: what has to be typed
into YouTrack is already there, so the export stops being the way work gets logged
and becomes the way to see what was logged. It is still worth having — it is how
someone checks a week, and how the hours that only a human can attribute get
found — but it is no longer the thing the fields depend on.

### Open questions

* **What is written back, and when.** A comment on the issue, or a work item. On
  submit, or when the window closes after the day's editing has settled. And if
  someone edits their standup and submits again, the plugin has to decide between
  updating what it wrote and writing a second copy.
* **Hours.** A comment needs no duration; a work item does. If work items are
  what the PM needs, hours are being asked for in YouTrack as they are today, and
  the standup's job is to have the description ready. That decides whether the
  weekly step disappears or merely gets shorter.
* **Whose credentials do the writing.** A personal token per developer gives an
  audit trail that attributes the work correctly, and means storing a credential
  that can act as that person in the plugin's key value store. A shared service
  account avoids storing those, and attributes everything to the plugin.
* **Consent, and where the text goes.** This is the point at which standup text
  leaves the server for another service, so the integration has to be off unless
  a channel asks for it, and it has to be clear that connecting a project means
  the notes in that channel go to YouTrack. This is the same question the AI
  summaries raise, and it will be answered the same way for both.
* **When YouTrack is unavailable.** A standup must never fail to save because an
  external service is down. That means writing back afterwards, with retries, and
  somewhere the failures are visible rather than lost.
* **How entries map to issues.** Work that had no ticket needs somewhere to
  appear, or it becomes the part that never gets logged. An entry naming several
  issues needs a rule too: the same note on each, or split between them.
* **One project per standup.** A team working across two projects at once has one
  channel and two places its notes belong.

### Open questions about the report itself

* **What a week is.** The channel already has a timezone and a schedule, and that
  schedule can be monthly. Monday to Sunday in the channel's timezone is the
  obvious answer, and worth stating rather than assuming.
* **How far back the data goes.** A weekly read on a Monday morning needs the week
  that just ended to still be in the key value store. Retention is already an open
  question for the rollover warnings, and now it is also how far back a failed
  write-back can be retried.
* **Who reads it, and where it lands.** Details and work notes make this the most
  sensitive thing the plugin holds: a DM to the developer, a file posted in the
  channel, or a file produced by a command run by whoever needs it.

### What not to add

More questions that must be answered. Hours, percentage complete and priority all
have a home already — YouTrack, or the PM's own workflow — and asking for them in
the standup is what turns a two-minute habit into a form to get through.

## Native Mattermost UX Enhancements

### Interactive modal inputs

Instead of relying on back-and-forth DM questions, Raven can trigger a
Mattermost Interactive Dialog (modal). This allows users to fill out "Yesterday,"
"Today," and "Blockers" in a single clean form, reducing notification fatigue and
making updates faster.

### Threaded blocker workspaces

When a user reports a blocker in their standup, Raven can automatically post the
aggregated team standup to the designated channel and create a specific thread
under that post titled 🚨 Blocker: [User Name]. This keeps channel noise down
while giving the team a dedicated space to swarm and resolve the issue.

### Slash command overrides

Add robust `/raven` commands so users can update their status on the fly. For
example, `/raven update today Pushing the API hotfix` or
`/raven block Waiting on design assets` allows developers to update their standup
without breaking their workflow.

## Smart Auto-Fill & Integrations

### Contextual "Yesterday" pre-fills

Integrate Raven with Jira, GitLab, GitHub, or Mattermost Boards. When Raven pings
a user for their standup, it can proactively suggest: "It looks like you merged
PR #402 and moved ticket ENG-12 to 'Done' yesterday. Want me to add this to your
update?"

### Calendar-aware pings

Integrate with Outlook or Google Calendar. If a team member is marked as OOO (Out
of Office) or is currently in a meeting when the standup ping goes out, Raven
automatically pauses the prompt and updates the team channel with an OOO status
for that user.

## AI & Async Productivity

### Executive TL;DR summaries

For larger teams or cross-functional stakeholders who monitor the standup
channel, Raven can use a lightweight LLM integration to post a daily summary
above the individual updates. For example: "Team summary: 4 PRs merged, 2 active
blockers regarding the database migration (tagging @DBA-team), and 3 people
working on the frontend redesign."

### Timezone-staggered rollups

Mattermost is heavily used by distributed, open-source, and global enterprise
teams. Raven should ping users at their local 9:00 AM, but hold the aggregated
broadcast until a designated "Core Team Time" or publish rolling updates with a
final "End of Day" digest.

## Agile Health & Metrics

### One-click morale check

Add an optional, anonymous emoji-reaction step to the standup modal asking, "How
are you feeling about the sprint today?" Raven can track these micro-sentiments
over time to warn Scrum Masters or Engineering Managers of impending burnout.

### Task rollover warnings

If Raven notices a user typing the exact same task in "Today" for three
consecutive days, it can gently prompt the user in a DM: "Looks like [Task X] is
taking a while. Do you want me to flag this as a blocker so the team can help?"
