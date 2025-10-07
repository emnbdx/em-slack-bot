const { WebClient } = require('@slack/web-api')
const fs = require('fs').promises
const path = require('path')

class AperallManager {
    constructor(client) {
        this.client = client
        this.organizers = {}
        this.refusedUsers = new Set()
        this.monthlyHistory = {}
        this.dataFile = path.join(__dirname, 'data', 'aperall.json')
        this.loadData()
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8')
            const parsed = JSON.parse(data)
            this.organizers = parsed.organizers || {}
            this.refusedUsers = new Set(parsed.refusedUsers || [])
            this.lastDrawMonth = parsed.lastDrawMonth || null
            this.monthlyHistory = parsed.monthlyHistory || {}
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Erreur lors du chargement des données aperall:', error)
            }
            this.organizers = {}
            this.refusedUsers = new Set()
            this.lastDrawMonth = null
            this.monthlyHistory = {}
        }
    }

    async saveData() {
        try {
            const data = {
                organizers: this.organizers,
                refusedUsers: Array.from(this.refusedUsers),
                lastDrawMonth: this.lastDrawMonth,
                monthlyHistory: this.monthlyHistory
            }
            await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2))
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des données aperall:', error)
        }
    }

    async handleAperallCommand(command) {
        const args = command.text ? command.text.split(' ') : []

        if (args[0] === 'reset' && command.user_id === process.env.APERALL_ADMIN_USER_ID) {
            return await this.resetData()
        }

        const channelName = command.channel_name

        if (channelName !== process.env.APERALL_CHANNEL_NAME) {
            return "❌ Cette commande ne peut être utilisée que dans le canal #" + process.env.APERALL_CHANNEL_NAME
        }

        const now = new Date()
        const frTime = new Date(now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }))
        const hour = frTime.getHours()

        if (args.length === 0) {
            const timeStr = frTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

            if (hour >= 0 && hour < 9) {
                const messages = [
                    "😴 Tu devrais dormir ! Il est " + timeStr + " et l'apérall c'est après 18h",
                    "🌙 C'est l'heure de faire dodo ! L'apérall attendra demain soir",
                    "🛌 " + timeStr + " ? Va te coucher ! L'apérall c'est pour les gens éveillés",
                    "💤 Tu rêves d'apérall ? Réveille-toi d'abord ! Il est " + timeStr
                ]
                return messages[Math.floor(Math.random() * messages.length)]
            } else if (hour >= 9 && hour < 12) {
                const messages = [
                    "☕ C'est plutôt l'heure du café ! L'apérall c'est après 18h",
                    "🌅 " + timeStr + " ? Un petit café d'abord, l'apérall attendra ce soir",
                    "☀️ Bonjour ! Café d'abord, apérall plus tard (après 18h)",
                    "☕ Réveille-toi avec un café ! L'apérall c'est pour ce soir"
                ]
                return messages[Math.floor(Math.random() * messages.length)]
            } else if (hour >= 12 && hour < 14) {
                const messages = [
                    "🍽️ Bien tenté ! Mais c'est l'heure du déj, l'apérall c'est après 18h",
                    "🥗 " + timeStr + " ? Déjà l'apérall ? Non, c'est l'heure du déjeuner !",
                    "🍴 Déjeune d'abord ! L'apérall c'est pour ce soir après 18h",
                    "🥪 Pas encore ! C'est l'heure du repas, l'apérall attendra"
                ]
                return messages[Math.floor(Math.random() * messages.length)]
            } else if (hour >= 14 && hour < 18) {
                const messages = [
                    "💪 Allez encore un effort ! L'apérall c'est dans " + (18 - hour) + "h",
                    "⏰ " + timeStr + " ? Patience ! Encore " + (18 - hour) + "h avant l'apérall",
                    "🏃‍♂️ Courage ! L'apérall approche, plus que " + (18 - hour) + "h à tenir",
                    "⏳ Bientôt ! L'apérall c'est à 18h, encore " + (18 - hour) + "h de patience"
                ]
                return messages[Math.floor(Math.random() * messages.length)]
            } else {
                const messages = [
                    "🍻 Let's go ! C'est l'heure de l'apérall ! Profite bien !",
                    "🥂 " + timeStr + " ? Parfait ! L'apérall a commencé, santé !",
                    "🍷 Moment parfait pour un apérall ! C'est parti !",
                    "🍸 " + timeStr + " ? C'est l'heure ! L'apérall est lancé !"
                ]
                return messages[Math.floor(Math.random() * messages.length)]
            }
        }

        if (args[0] === 'cki') {
            return await this.announceOrganizers(command.channel_id)
        }

        if (args[0] === 'cmort') {
            return await this.handleRefusal(command)
        }

        if (args[0] === 'cmoi') {
            return await this.handleTakeOver(command)
        }

        return "❓ Commande inconnue. Utilisez /aperall, /aperall cki, /aperall cmort ou /aperall cmoi @user"
    }

    getCurrentMonth() {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }

    isNewMonth() {
        const currentMonth = this.getCurrentMonth()
        return this.lastDrawMonth !== currentMonth
    }

    async announceOrganizers(channelId) {
        if (this.isNewMonth()) {
            const previousMonth = this.lastDrawMonth
            if (previousMonth && this.organizers[channelId]) {
                this.monthlyHistory[previousMonth] = this.monthlyHistory[previousMonth] || {}
                this.monthlyHistory[previousMonth][channelId] = [...this.organizers[channelId]]
            }

            this.refusedUsers.clear()
            this.organizers = {}
            this.lastDrawMonth = this.getCurrentMonth()
            await this.saveData()
            return await this.selectRandomOrganizers(channelId)
        }

        if (this.organizers[channelId] && this.organizers[channelId].length > 0) {
            const organizers = this.organizers[channelId].map(id => `<@${id}>`).join(' et ')
            const monthName = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
            return `🎉 Les organisateurs de l'apérall de ${monthName} sont : ${organizers}`
        } else {
            return await this.selectRandomOrganizers(channelId)
        }
    }

    getPreviousOrganizers(channelId) {
        const previousOrganizers = new Set()
        Object.values(this.monthlyHistory).forEach(monthData => {
            if (monthData[channelId]) {
                monthData[channelId].forEach(id => previousOrganizers.add(id))
            }
        })
        return previousOrganizers
    }

    async selectRandomOrganizers(channelId) {
        try {
            const members = await this.getChannelMembers(channelId)
            const previousOrganizers = this.getPreviousOrganizers(channelId)
            const availableMembers = members.filter(id =>
                !this.refusedUsers.has(id) &&
                !previousOrganizers.has(id)
            )
            const monthName = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

            if (availableMembers.length < 2) {
                this.refusedUsers.clear()
                const newSelection = members.slice(0, 2)
                this.organizers[channelId] = newSelection
                await this.saveData()
                const organizers = newSelection.map(id => `<@${id}>`).join(' et ')

                const themeMessages = [
                    `🎲 Nouvelle sélection pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\nUn apérall c'est mieux avec un thème non ? Ce sera quoi le vôtre ${organizers} ?`,
                    `🎲 Nouvelle sélection pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\nAllez ${organizers}, à vous de choisir le thème de l'apérall !`,
                    `🎲 Nouvelle sélection pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\n${organizers}, c'est parti pour l'organisation ! Quel thème allez-vous nous proposer ?`,
                    `🎲 Nouvelle sélection pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\n${organizers}, à vous de jouer ! Quel sera le thème de cet apérall ?`
                ]

                return themeMessages[Math.floor(Math.random() * themeMessages.length)]
            }

            const shuffled = availableMembers.sort(() => 0.5 - Math.random())
            const selected = shuffled.slice(0, 2)

            this.organizers[channelId] = selected
            await this.saveData()
            const organizers = selected.map(id => `<@${id}>`).join(' et ')

            const themeMessages = [
                `🎲 Tirage pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\nUn apérall c'est mieux avec un thème non ? Ce sera quoi le vôtre ${organizers} ?`,
                `🎲 Tirage pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\nAllez ${organizers}, à vous de choisir le thème de l'apérall !`,
                `🎲 Tirage pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\n${organizers}, c'est parti pour l'organisation ! Quel thème allez-vous nous proposer ?`,
                `🎲 Tirage pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\n${organizers}, à vous de jouer ! Quel sera le thème de cet apérall ?`
            ]

            return themeMessages[Math.floor(Math.random() * themeMessages.length)] + `\n\nSi vous ne pouvez pas organiser, utilisez \`/aperall cmort\` pour être remplacé !`
        } catch (error) {
            return `❌ Erreur lors de la sélection : ${error.message}`
        }
    }

    async handleRefusal(command) {
        const channelId = command.channel_id
        const userId = command.user_id

        if (!this.organizers[channelId] || !this.organizers[channelId].includes(userId)) {
            return "❌ Vous n'êtes pas dans la liste des organisateurs actuels"
        }

        this.refusedUsers.add(userId)

        try {
            const members = await this.getChannelMembers(channelId)
            const availableMembers = members.filter(id =>
                !this.refusedUsers.has(id) &&
                !this.organizers[channelId].includes(id)
            )

            if (availableMembers.length === 0) {
                this.refusedUsers.clear()
                const newSelection = members.slice(0, 2)
                this.organizers[channelId] = newSelection
                await this.saveData()
                const organizers = newSelection.map(id => `<@${id}>`).join(' et ')
                return `🔄 Nouvelle sélection complète ! Les organisateurs du prochain apérall sont : ${organizers}`
            }

            const randomIndex = Math.floor(Math.random() * availableMembers.length)
            const newOrganizer = availableMembers[randomIndex]

            const organizerIndex = this.organizers[channelId].indexOf(userId)
            this.organizers[channelId][organizerIndex] = newOrganizer
            await this.saveData()

            const organizers = this.organizers[channelId].map(id => `<@${id}>`).join(' et ')
            return `🔄 <@${userId}> a été remplacé par <@${newOrganizer}> !\n\nLes organisateurs du prochain apérall sont : ${organizers}`
        } catch (error) {
            return `❌ Erreur lors du remplacement : ${error.message}`
        }
    }

    async handleTakeOver(command) {
        const channelId = command.channel_id
        const userId = command.user_id
        const args = command.text ? command.text.split(' ') : []

        if (args.length < 2) {
            return "❌ Utilisation : /aperall cmoi @user"
        }

        let targetUser = args[1].replace(/[<@>]/g, '')

        if (!this.organizers[channelId] || this.organizers[channelId].length === 0) {
            return "❌ Aucune assignation en cours. Utilisez d'abord /aperall cki pour sélectionner les organisateurs"
        }

        if (this.organizers[channelId].includes(userId)) {
            return "❌ Vous êtes déjà dans la liste des organisateurs"
        }

        try {
            if (!targetUser.startsWith('U')) {
                const userInfo = await this.client.users.lookupByEmail({ email: targetUser + '@' + process.env.SLACK_DOMAIN })
                if (userInfo.user) {
                    targetUser = userInfo.user.id
                } else {
                    const usersList = await this.client.users.list()
                    const user = usersList.members.find(member =>
                        member.name === targetUser ||
                        member.real_name === targetUser ||
                        (member.profile && member.profile.display_name === targetUser)
                    )
                    if (user) {
                        targetUser = user.id
                    } else {
                        return "❌ Utilisateur non trouvé. Vérifiez le pseudo ou utilisez l'ID utilisateur"
                    }
                }
            }

            if (!this.organizers[channelId].includes(targetUser)) {
                return "❌ Cette personne n'est pas dans la liste des organisateurs actuels"
            }

            const organizerIndex = this.organizers[channelId].indexOf(targetUser)
            this.organizers[channelId][organizerIndex] = userId
            await this.saveData()

            const organizers = this.organizers[channelId].map(id => `<@${id}>`).join(' et ')
            return `🔄 <@${userId}> a pris la place de <@${targetUser}> !\n\nLes organisateurs du prochain apérall sont : ${organizers}`
        } catch (error) {
            return `❌ Erreur lors du remplacement : ${error.message}`
        }
    }

    async getChannelMembers(channelId) {
        const result = await this.client.conversations.members({ channel: channelId })
        const members = []

        for (const id of result.members) {
            try {
                const userInfo = await this.client.users.info({ user: id })
                if (!userInfo.user.deleted && !userInfo.user.is_bot) {
                    members.push(id)
                }
            } catch {
                // Ignore les erreurs et continue
            }
        }

        return members
    }

    async resetData() {
        this.organizers = {}
        this.refusedUsers = new Set()
        this.monthlyHistory = {}
        this.lastDrawMonth = null
        await this.saveData()
        return "🔄 Données d'apérall réinitialisées ! L'historique des mois passés a été effacé."
    }
}

module.exports = AperallManager