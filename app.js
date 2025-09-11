const { App } = require("@slack/bolt")
const { WebClient } = require('@slack/web-api')
const CagnotteManager = require('./cagnotte')
const AperallManager = require('./aperall')
require("dotenv").config()

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
})
const client = new WebClient(process.env.SLACK_BOT_TOKEN)

const cagnotteManager = new CagnotteManager(client)
const aperallManager = new AperallManager(client)

app.command("/cagnotte", async({ command, ack, say }) => {
    await ack()

    try {
        await cagnotteManager.createCagnotte(command)
    } catch (e) {
        await say(e.message)
    }
});

app.action('exclude_user', async({ action, ack, say }) => {
    await ack()
    await cagnotteManager.handleExcludeUser(action)
});

app.action('validate', async({ action, ack, say }) => {
    await ack()
    await cagnotteManager.handleValidate(action)
});

app.action('invite', async({ action, ack, say }) => {
    await ack()
    await cagnotteManager.handleInvite(action)
});

app.command("/aperall", async({ command, ack, say }) => {
    await ack()

    try {
        const response = await aperallManager.handleAperallCommand(command)
        await say(response)
    } catch (e) {
        await say(`❌ Erreur : ${e.message}`)
    }
});

(async() => {
    const port = process.env.PORT || 3000
    await app.start(port)
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`)
})();