# Popopo CLI Command Reference

Read this file only when you need the command catalog while using `$popopo-cli`.

## Install And Location

- Global install target: `bun i -g popopo.js`
- Command name after install: `popopo`
- Start discovery with: `popopo --help`

## Core Commands

```text
popopo anonymous [--firebase-only] [--session-file <path>]
popopo signup --email <email> --password <password> [--display-name <name>] [--alias <handle>]
popopo signin --email <email> --password <password>
popopo auth sign-in-with-credential --sign-in-method <method> [credential fields]
popopo signout
popopo lookup [--id-token <token>]
popopo auth verify-phone-number --phone-number <E164> [--timeout-ms <ms>]
popopo auth phone send-code --phone-number <E164>
popopo auth upgrade google [--google-id-token <jwt> | --google-access-token <token> | --google-auth-code <code>]
popopo auth upgrade apple [--apple-id-token <jwt> | --apple-access-token <token> | --apple-auth-code <code>] [--nonce <nonce>]
popopo auth upgrade phone --session-info <session> --code <sms-code>
popopo me
```

## User Commands

```text
popopo user get --user-id <id>
popopo user register
popopo user link-with-credential --sign-in-method <method> [credential fields]
popopo user update-phone-number --verification-id <id> --verification-code <code>
popopo user update [--display-name <name>] [--alias <handle>] [--another-name <name>] [--icon-source <url>]
popopo user change display-name --display-name <name>
popopo user change another-name --another-name <name>
popopo user change icon-source --icon-source <value>
popopo user change owner-user-id [--user-id <id>]
```

## Spaces Commands

```text
popopo spaces create --name <name> --background-id <background-id>
popopo spaces connect --space-key <space-key> [--muted <true|false>]
popopo spaces list [--kind <value>] [--category <value>] [--query key=value]
popopo spaces current [--kind <value>] [--category <value>] [--query key=value]
popopo spaces get --space-key <space-key> [--kind <value>] [--category <value>] [--query key=value]
popopo spaces connection-info --space-key <space-key> [--body-json <json>]
popopo spaces message --space-key <space-key> --text <text>
popopo spaces messages --space-key <space-key> [--limit <n>] [--order-by <field dir>]
popopo spaces watch --space-key <space-key> [--limit <n>] [--interval-ms <ms>] [--timeout-ms <ms>]
```

## Lives Commands

```text
popopo lives list [--kind <value>] [--category <value>] [--query key=value]
popopo lives current [--kind <value>] [--category <value>] [--query key=value]
popopo lives get --space-key <space-key> [--kind <value>] [--category <value>] [--query key=value]
popopo lives list --space-key <space-key> [--kind <value>] [--category <value>] [--query key=value]
popopo lives start --space-key <space-key> --genre-id <genre-id> [--tag <tag>] [--can-enter <true|false>]
popopo lives audience-enter --space-key <space-key>
popopo lives join-audience --space-key <space-key>
popopo lives enter --space-key <space-key>
popopo lives receive-info --space-key <space-key> [--live-id <live-id>]
popopo lives stream-audio --space-key <space-key> [--live-id <live-id>] --output <path|-> [--max-bytes <n>]
popopo lives publish-audio [--space-key <space-key>] [--audio-file <path> | --tone-hz <hz>] [--gain <0-1>] [--loop] [--duration-ms <ms>]
popopo lives powers
popopo lives send-power --space-key <space-key> [--live-id <live-id>] --power-id <id|name>
popopo lives comment --space-key <space-key> [--live-id <live-id>] --text <text>
popopo lives comments --space-key <space-key> [--live-id <live-id>] [--limit <n>] [--order-by <field dir>]
popopo lives selection-create --space-key <space-key> [--live-id <live-id>] --kind <message|talk> [--title <value>]
popopo lives selections --space-key <space-key> [--live-id <live-id>] [--limit <n>] [--order-by <field dir>]
popopo lives selection-get --space-key <space-key> [--live-id <live-id>] --selection-id <id>
popopo lives selection-participants --space-key <space-key> [--live-id <live-id>] --selection-id <id> [--limit <n>] [--order-by <field dir>]
popopo lives selection-sequences --space-key <space-key> [--live-id <live-id>] --selection-id <id> [--limit <n>] [--order-by <field dir>]
popopo lives selection-start-pseudo-nominate --space-key <space-key> [--live-id <live-id>] --selection-id <id> [--sequence-id <id>] [--count <n>]
popopo lives selection-start-draw --space-key <space-key> [--live-id <live-id>] --selection-id <id> [--sequence-id <id>] [--count <n>]
popopo lives watch --space-key <space-key> [--live-id <live-id>] [--limit <n>] [--interval-ms <ms>] [--timeout-ms <ms>]
```

## Other Domains

```text
popopo coins balance [--user-id <id>]
popopo coins user-private-data [--user-id <id>]
popopo push upsert-device --device-id <id> [--device-name <name>] [--system <dummy|android|ios>] [--app <name>]
popopo calls create-push --kind <user-call|space-friends-call|live-follower-call> --space-key <space-key> [--user-id <id>] [--live-id <id>]
popopo skins list [--user-id <id>] [--limit <n>] [--order-by <field dir>] [--page-token <token>]
popopo skins list-store [--limit <n>] [--order-by <field dir>] [--include-inactive] [--include-non-public]
popopo skins change --inventory-id <id>
popopo invites list [--query key=value]
popopo invites get --code <invite-code>
popopo invites accept --code <invite-code>
popopo notifications list [--query key=value]
popopo notifications get --notification-id <id>
popopo notifications mark-read --notification-id <id>
popopo notifications personal-list [--query key=value]
popopo notifications personal-get --notification-id <id>
popopo notifications personal-delivery-content --notification-id <id> [--status received]
popopo notifications receive-latest-present [--query key=value]
popopo tso exchange-code --code <code> --code-verifier <verifier>
popopo tso refresh-token --refresh-token <token>
popopo tso status --file-id <id>
popopo tso build-file-url --file-id <id> [--modifier-enabled]
```

## Global Options To Remember

```text
--strings <path>
--session-file <path>
--base-url <url>
--api-base-url <url>
--api-key <key>
--auth-base-url <url>
--secure-token-base-url <url>
--timeout-ms <ms>
--request-uri <url>
--phone-number <E164>
--space-key <value>
--live-id <value>
--user-id <value>
--inventory-id <value>
--power-id <value>
--selection-id <value>
--sequence-id <value>
--output <path|->
--audio-file <path>
--limit <n>
--max-bytes <n>
--interval-ms <ms>
--no-auto-create
--no-persist
--query key=value
--json
```

## Operational Notes

- Default strings path resolves to `extracted/jadx_out/resources/res/values/strings.xml` when present.
- Default session path resolves to `.popopo-session.json` at the repository root.
- The CLI persists session changes after commands unless `--no-persist` is set.
- Object results are usually printed as formatted JSON even without `--json`.
- Watch, message, and audio flows may emit line-oriented output; use explicit limits and timeouts when scripting them.
