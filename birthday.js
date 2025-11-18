const { WebClient } = require('@slack/web-api')
const https = require('https')
const dayjs = require('dayjs')
const customParseFormat = require('dayjs/plugin/customParseFormat')
const OpenAI = require('openai')

dayjs.extend(customParseFormat)

class BirthdayManager {
    constructor(client) {
        this.client = client
        this.openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
    }

    async fetchGoogleSheet(id) {
        return new Promise((resolve, reject) => {
            const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
            
            https.get(csvUrl, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Erreur HTTP: ${res.statusCode}`))
                    return
                }

                let data = ''
                res.on('data', (chunk) => {
                    data += chunk
                })

                res.on('end', () => {
                    resolve(data)
                })
            }).on('error', (err) => {
                reject(err)
            })
        })
    }

    parseCSV(csvData) {
        const lines = csvData.split('\n').filter(line => line.trim())
        const birthdays = []

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i]
            const columns = this.parseCSVLine(line)
            
            if (columns.length >= 2) {
                const nom = columns[0].trim()
                const dateStr = columns[1].trim()
                
                if (nom && dateStr) {
                    try {
                        var date = dayjs(dateStr, 'DD/MM/YYYY', true)
                        date = date.isValid() ? date.toDate() : null

                        if (date) {
                            birthdays.push({ nom, date })
                        }
                    } catch (e) {
                        console.error(`Erreur parsing date pour ${nom}: ${dateStr}`, e)
                    }
                }
            }
        }

        return birthdays
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

    getTodayBirthdays(birthdays) {
        const today = dayjs()

        return birthdays.filter(birthday => {
            const birthdayDate = dayjs(birthday.date)
            return birthdayDate.month() === today.month() && birthdayDate.date() === today.date()
        })
    }

    async generateBirthdayMessage(noms) {
        const nomsList = Array.isArray(noms) ? noms : [noms]
        const nomsStr = nomsList.length === 1 
            ? nomsList[0] 
            : nomsList.slice(0, -1).join(', ') + ' et ' + nomsList[nomsList.length - 1]

        if (!this.openai) {
            if (nomsList.length === 1) {
                return `🎉 Joyeux anniversaire ${nomsStr} ! :birthday::gift::confetti_ball:`
            } else {
                return `🎉 Joyeux anniversaire à ${nomsStr} ! :birthday::gift::confetti_ball:`
            }
        }

        try {
            const examples = [
                "On commence la semaine avec l'anniversaire de notre grande performeuse [NOM], merci de lui envoyer une montagne d'amour :birthday::gift::confetti_ball:",
                "C'est l'heure de fêter un nouveau venu parmi les traileurs HelloAsso: Joyeux anniversaire à [NOM] :partying_face::gift::birthday:",
                "On pense à ne pas partir sans une pensée pour [NOM] qui fête son Birthday today. Très joyeux anniversaire à elle :partying_face::gift::birthday:"
            ]

            const prompt = nomsList.length === 1
                ? `Génère un message d'anniversaire original et sympa pour ${nomsStr}. Le message doit être différent des exemples et inclure des emojis.`
                : `Génère un message d'anniversaire original et sympa pour ${nomsList.length} personnes : ${nomsStr}. Le message doit mentionner toutes les personnes et être différent des exemples. Inclus des emojis.`

            const completion = await this.openai.chat.completions.create({
                model: "gpt-5-nano",
                messages: [
                    {
                        role: "developer",
                        content: "Tu es un bot qui écrit des messages d'anniversaire sympas et originaux pour Slack. Les messages doivent être variés, créatifs, et inclure des emojis comme :birthday:, :gift:, :confetti_ball:, :partying_face:. Mentionne les personnes avec @Nom. Sois original et varie les styles. Fais juste une phrase."
                    },
                    {
                        role: "user",
                        content: `Voici des exemples de messages d'anniversaire:\n${examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}\n\n${prompt}`
                    }
                ],
                temperature: 0.9
            })

            return completion.choices[0].message.content.trim()
        } catch (error) {
            console.error('Erreur lors de la génération du message OpenAI:', error)
            if (nomsList.length === 1) {
                return `🎉 Joyeux anniversaire ${nomsStr} ! :birthday::gift::confetti_ball:`
            } else {
                return `🎉 Joyeux anniversaire à ${nomsStr} ! :birthday::gift::confetti_ball:`
            }
        }
    }

    async checkAndSendBirthdays() {
        try {
            const sheetId = process.env.GOOGLE_SHEET_ID
            if (!sheetId) {
                console.error('GOOGLE_SHEET_ID non configuré dans .env')
                return
            }

            const channelId = process.env.SLACK_BIRTHDAY_CHAN
            if (!channelId) {
                console.error('SLACK_BIRTHDAY_CHAN non configuré dans .env')
                return
            }

            const csvData = await this.fetchGoogleSheet(sheetId)
            const birthdays = this.parseCSV(csvData)
            const todayBirthdays = this.getTodayBirthdays(birthdays)

            if (todayBirthdays.length === 0) {
                console.log('Aucun anniversaire aujourd\'hui')
                return
            }

            const noms = todayBirthdays.map(birthday => birthday.nom)
            const message = await this.generateBirthdayMessage(noms)

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

