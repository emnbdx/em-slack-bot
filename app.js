const { App } = require("@slack/bolt")
const { WebClient } = require('@slack/web-api')
require("dotenv").config()

// Initializes your app with your bot token and signing secret
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
})
const client = new WebClient(process.env.SLACK_BOT_TOKEN)

let excluded = {}

app.command("/cagnotte", async ({ command, ack, say }) => {
    await ack();

    let result

    try {
        result = await client.conversations.create({
            name: command.text,
            private: true
        });
    } catch (e) {
        await say(`Erreur lors de la création du canal -> ${e.data.error}`)
        return
    }

    await client.conversations.invite({
        channel: result.channel.id,
        users: command.user_id
    });

    const output = [
        {
            "type": "input",
            "block_id": result.channel.id,
            "element": {
                "type": "multi_users_select",
                "placeholder": {
                    "type": "plain_text",
                    "text": "Select users",
                    "emoji": true
                },
                "action_id": "exclude_user"
            },
            "label": {
                "type": "plain_text",
                "text": "Choisit les utilisateurs à exclure 🙅",
                "emoji": true
            }
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Valider",
                        "emoji": true
                    },
                    "value": `${command.user_id}_${result.channel.id}`,
                    "action_id": "validate"
                }
            ]
        }
    ]

    await client.chat.postEphemeral({
        channel: result.channel.id,
        user: command.user_id,
        blocks: output
    })
});

app.action('exclude_user', async ({ action, ack, say }) => {
    await ack();
    excluded[action.block_id] = action.selected_users
});

app.action('validate', async ({ action, ack, say }) => {
    await ack()

    let param = action.value.split('_')
    let userId = param[0]
    let channelId = param[1]

    client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Je récupère la liste des membres ⏳"
    })

    const result = await client.conversations.list()
    const general = result.channels.filter((el) => el.name == "general")[0]

    let members = {};
    for await (const result of client.paginate('conversations.members', {channel: general.id})) {
        for await (const id of result.members) {
            const info = await client.users.info({user: id, deleted: false, is_bot: false})
            members[info.user.id] = info.user.real_name
        }
    }

    let exclude = process.env.STATIC_EXCLUDE.split(',')
    exclude = exclude.concat(excluded[channelId])
    
    exclude.forEach((el) => delete members[el])

    const output = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `Je vais inviter :\n${Object.values(members).sort().join('\n')}`
            }
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "C'est ok 🚀",
                        "emoji": true
                    },
                    "value": `${channelId}_${Object.keys(members).join(',')}`,
                    "action_id": "invite"
                }
            ]
        }
    ]

    await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        blocks: output
    })
});

app.action('invite', async ({ action, ack, say }) => {
    await ack()

    let param = action.value.split('_')
    let channelId = param[0]
    let users = param[1]

    client.conversations.invite({
        channel: channelId,
        users: users
    })
});

(async () => {
    const port = 3210
    // Start your app
    await app.start(process.env.PORT || port)
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`)
})();