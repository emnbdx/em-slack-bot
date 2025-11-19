const { WebClient } = require('@slack/web-api')
const fs = require('fs').promises
const path = require('path')
const dayjs = require('dayjs')
const customParseFormat = require('dayjs/plugin/customParseFormat')
const OpenAI = require('openai')

dayjs.extend(customParseFormat)

class BirthdayManager {
    constructor(client) {
        this.client = client
        this.openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
        this.dataFile = path.join(__dirname, 'data', 'birthday.csv')
    }

    parseCSVLine(line) {
        const columns = []
        let current = ''
        let inQuotes = false

        for (let i = 0; i < line.length; i++) {
            const char = line[i]
            
            if (char === '"') {
                inQuotes = !inQuotes
            } else if (char === ',' && !inQuotes) {
                columns.push(current)
                current = ''
            } else {
                current += char
            }
        }
        columns.push(current)

        return columns.map(col => col.replace(/^"|"$/g, ''))
    }

    parseCSV(csvData) {
        const lines = csvData.split('\n').filter(line => line.trim())
        const birthdays = []

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i]
            const columns = this.parseCSVLine(line)
            
            if (columns.length >= 3) {
                const id = columns[0].trim()
                const nom = columns[1].trim()
                const dateStr = columns[2].trim()
                
                if (id && nom && dateStr) {
                    try {
                        var date = dayjs(dateStr, 'DD/MM/YYYY', true)
                        date = date.isValid() ? date.toDate() : null

                        if (date) {
                            birthdays.push({ id, nom, date })
                        }
                    } catch (e) {
                        console.error(`Erreur parsing date pour ${nom}: ${dateStr}`, e)
                    }
                }
            }
        }

        return birthdays
    }

    async loadBirthdays() {
        try {
            const csvData = await fs.readFile(this.dataFile, 'utf8')
            return this.parseCSV(csvData)
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`Fichier ${this.dataFile} non trouvé`)
                return []
            }
            console.error('Erreur lors du chargement des anniversaires:', error)
            return []
        }
    }

    getTodayBirthdays(birthdays) {
        const today = dayjs()

        return birthdays.filter(birthday => {
            const birthdayDate = dayjs(birthday.date)
            return birthdayDate.month() === today.month() && birthdayDate.date() === today.date()
        })
    }

    async generateBirthdayMessage(birthdays) {
        const birthdaysList = Array.isArray(birthdays) ? birthdays : [birthdays]
        const ids = birthdaysList.map(b => b.id)
        const mentions = ids.map(id => `<@${id}>`).join(', ')

        if (!this.openai) {
            if (birthdaysList.length === 1) {
                return `🎉 Joyeux anniversaire ${mentions} ! :birthday::gift::confetti_ball:`
            } else {
                return `🎉 Joyeux anniversaire à ${mentions} ! :birthday::gift::confetti_ball:`
            }
        }

        try {
            const examples = [
                "On commence la semaine avec l'anniversaire de notre grande performeuse [NOM], merci de lui envoyer une montagne d'amour",
                "C'est l'heure de fêter un nouveau venu parmi les traileurs HelloAsso: Joyeux anniversaire à [NOM]",
                "On pense à ne pas partir sans une pensée pour [NOM] qui fête son Birthday today. Très joyeux anniversaire à elle"
            ]

            const prompt = birthdaysList.length === 1
                ? `Génère un message d'anniversaire original et sympa pour ${mentions}. Le message doit être différent des exemples.`
                : `Génère un message d'anniversaire original et sympa pour ${birthdaysList.length} personnes : ${mentions}. Le message doit mentionner toutes les personnes et être différent des exemples.`

            const completion = await this.openai.chat.completions.create({
                model: "gpt-5-nano",
                messages: [
                    {
                        role: "developer",
                        content: "Tu es un bot qui écrit des messages d'anniversaire sympas et originaux pour Slack. Les messages doivent être variés, créatifs, et inclure des emojis. Sois original et varie les styles. Fais juste une phrase."
                    },
                    {
                        role: "user",
                        content: `Voici des exemples de messages d'anniversaire:\n${examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}\n\n${prompt}`
                    }
                ]
            })

            return completion.choices[0].message.content.trim()
        } catch (error) {
            console.error('Erreur lors de la génération du message OpenAI:', error)
            if (birthdaysList.length === 1) {
                return `🎉 Joyeux anniversaire ${mentions} ! :birthday::gift::confetti_ball:`
            } else {
                return `🎉 Joyeux anniversaire à ${mentions} ! :birthday::gift::confetti_ball:`
            }
        }
    }

    async checkAndSendBirthdays() {
        try {
            const channelId = process.env.SLACK_BIRTHDAY_CHAN
            if (!channelId) {
                console.error('SLACK_BIRTHDAY_CHAN non configuré dans .env')
                return
            }

            const birthdays = await this.loadBirthdays()
            const todayBirthdays = this.getTodayBirthdays(birthdays)

            if (todayBirthdays.length === 0) {
                console.log('Aucun anniversaire aujourd\'hui')
                return
            }

            const message = await this.generateBirthdayMessage(todayBirthdays)

            await this.client.chat.postMessage({
                channel: channelId,
                text: message
            })

            console.log(`Anniversaires envoyés pour ${todayBirthdays.length} personne(s)`)
        } catch (error) {
            console.error('Erreur lors de la vérification des anniversaires:', error)
        }
    }
}

module.exports = BirthdayManager

