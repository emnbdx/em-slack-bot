# em-slack-bot
Cagnotte is a Slack bot designed to simplify the process of creating new channels and inviting team members. Using a single slash command, `/cagnotte`, the bot will create a new channel, ask the user who to exclude, and then invite all remaining team members to the new channel.

## Prerequisites

To use this bot, you'll need:

- Node.js
- yarn
- A Slack account with administrative access to install and configure bots

## Installation and Setup

1. Clone this repository:
   ```shell
   git clone https://github.com/emnbdx/em-slack-bot.git
   ```
1. Navigate into the project directory:
   ```shell
   cd em-slack-bot
   ```
1. Install the required dependencies:
   ```shell
   yarn install
   ```
1. Rename the .env.example file to .env and update the following parameters with your own information:
   ```shell
   SLACK_SIGNING_SECRET=
   SLACK_BOT_TOKEN=
   SLACK_GENERAL_CHAN=
   STATIC_EXCLUDE=
   ```
SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN are available from your app settings on Slack's development portal. 
SLACK_GENERAL_CHAN is the main chan of you slack (by default general) i use this chan to get all users.
STATIC_EXCLUDE is a comma-separated list of user IDs that should be excluded when inviting users to a new channel.

## Running the Bot
To start the bot in a development environment, use the following command:
   ```shell
   yarn run dev
   ```

The bot should now be running and ready to respond to /cagnotte commands on Slack.