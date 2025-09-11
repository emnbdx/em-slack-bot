const { WebClient } = require('@slack/web-api')

class CagnotteManager {
    constructor(client) {
        this.client = client
        this.excluded = {}
        this.members = {}
    }

    async createCagnotte(command) {
        let result

        try {
            result = await this.client.conversations.create({
                name: command.text,
                is_private: true
            });
        } catch (e) {
            throw new Error(`Erreur lors de la création du canal -> ${e.data.error} pour en savoir plus sur cette erreur : https://api.slack.com/methods/conversations.create#errors`)
        }

        await this.client.conversations.invite({
            channel: result.channel.id,
            users: command.user_id
        });

        this.excluded = {}

        const output = [{
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
                "elements": [{
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Valider",
                        "emoji": true
                    },
                    "value": `${command.user_id}_${result.channel.id}`,
                    "action_id": "validate"
                }]
            }
        ]

        await this.client.chat.postEphemeral({
            channel: result.channel.id,
            user: command.user_id,
            blocks: output
        })
    }

    async handleExcludeUser(action) {
        this.excluded[action.block_id] = action.selected_users
    }

    async handleValidate(action) {
        let param = action.value.split('_')
        let userId = param[0]
        let channelId = param[1]

        this.client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "Je récupère la liste des membres ⏳"
        })

        const result = await this.client.conversations.list()
        const general = result.channels.filter((el) => el.name == process.env.SLACK_GENERAL_CHAN)[0]

        this.members = {};
        for await (const page of this.client.paginate('conversations.members', { channel: general.id })) {
            for (const id of page.members) {
                const info = await this.client.users.info({ user: id })
                if (!info.user.deleted && !info.user.is_bot) {
                    this.members[info.user.id] = info.user.real_name
                }
            }
        }

        let exclude = process.env.STATIC_EXCLUDE.split(',')
        exclude = exclude.concat(this.excluded[channelId])

        exclude.forEach((el) => delete this.members[el])

        const output = [{
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `Je vais inviter :\n${Object.values(this.members).sort().join('\n')}`
                }
            },
            {
                "type": "actions",
                "elements": [{
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "C'est ok 🚀",
                        "emoji": true
                    },
                    "value": channelId,
                    "action_id": "invite"
                }]
            }
        ]

        await this.client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            blocks: output
        })
    }

    async handleInvite(action) {
        this.client.conversations.invite({
            channel: action.value,
            users: Object.keys(this.members).join(',')
        })
    }
}

module.exports = CagnotteManager