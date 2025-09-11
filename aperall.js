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
        console.log(command)
        const args = command.text ? command.text.split(' ') : []

        if (args[0] === 'reset' && command.user_id === process.env.APERALL_ADMIN_USER_ID) {
            return await this.resetData()
        }

        const channelName = command.channel_name

        if (channelName !== process.env.APERALL_CHANNEL_NAME) {
            return "❌ Cette commande ne peut être utilisée que dans le canal #" + process.env.APERALL_CHANNEL_NAME
        }

        const now = new Date()
        const hour = now.getHours()

        if (args.length === 0) {
            if (hour < 18) {
                const messages = [
                    "🤔 C'est pas encore l'apérall ! Il est que " + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                    "😴 Trop tôt pour l'apérall ! Reviens après 18h",
                    "🍺 Patience ! L'apérall c'est après 18h",
                    "⏰ Encore " + (18 - hour) + "h avant l'apérall !"
                ]
                return messages[Math.floor(Math.random() * messages.length)]
            } else {
                const messages = [
                    "🍻 C'est l'heure de l'apérall ! Profitez bien !",
                    "🥂 L'apérall a commencé ! Santé !",
                    "🍷 Moment parfait pour un apérall !",
                    "🍸 C'est parti pour l'apérall !"
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

        return "❓ Commande inconnue. Utilisez /aperall, /aperall cki ou /aperall cmort"
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
                return `🎲 Nouvelle sélection pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}`
            }

            const shuffled = availableMembers.sort(() => 0.5 - Math.random())
            const selected = shuffled.slice(0, 2)

            this.organizers[channelId] = selected
            await this.saveData()
            const organizers = selected.map(id => `<@${id}>`).join(' et ')

            return `🎲 Tirage pour ${monthName} ! Les organisateurs de l'apérall sont : ${organizers}\n\nSi vous ne pouvez pas organiser, utilisez \`/aperall cmort\` pour être remplacé !`
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