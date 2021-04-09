import * as dotenv from 'dotenv'
import Discord from 'discord.js'
import cron from 'node-cron'
import lowdb from 'lowdb'
import { default as FileSync } from 'lowdb/adapters/FileSync.js'
import { join as joinPath, dirname } from 'path'
import { fileURLToPath } from 'url'

// config environment
dotenv.config()
const client = new Discord.Client()
const __dirname = dirname(fileURLToPath(import.meta.url))
const db = lowdb(new FileSync(joinPath(__dirname, 'db.json')))
db.defaults({ users: [] }).write()

// connect beep beep boop
const env = process.env.DISCORD_ENV?.trim()?.toUpperCase() === 'PRD'
    ? {
        token: process.env.DISCORD_HR_TOKEN?.trim(),
        cron: process.env.DISCORD_MORNING_SCHEDULE?.trim(),
        readyMessage: process.env.DISCORD_HR_READYMESSAGE?.trim() === 'true',
        lobby: process.env.DISCORD_LOBBY_CHANNEL_PRD?.trim(),
    }
    : {
        token: process.env.DISCORD_HR_TOKEN?.trim(),
        cron: process.env.DISCORD_MORNING_SCHEDULE?.trim(),
        readyMessage: process.env.DISCORD_HR_READYMESSAGE?.trim() === 'true',
        lobby: process.env.DISCORD_LOBBY_CHANNEL_DEV?.trim(),
    }
await client.login(env.token)

const intix = await client.guilds.cache.first()?.fetch() // only active in Intix Discord
if (!intix) {
    console.error('Bot is not active in the Intix Discord server')
    process.exit(1)
}
const lobby = await intix.channels.cache.find(channel => channel.id === env.lobby)?.fetch()
if (!lobby) {
    console.error('The main channel defined in the environment does not exist')
    process.exit(1)
}

// message the bot will send when he is ready for action
const readyMessages = [
    'Ik was even weg maar ben weer terug, boyz. 😎\nEens snel `git diff`en om te zien wat ik bijgeleerd heb maar @me maar als ik iets kan doen! 💪',
    'Oof. Ik was even weg maar heb precies niet te veel gemist.\nEventjes bijbenen 🦵🦵🦵 en @me maar als ik iets voor jullie kan doen. 👍',
    'Dag brolega\'s. 👋 Wilde even melden dat ik terug ben!\nIk was eventjes offline maar ben normaal weer 24/7 bereikbaar. 💯😎👌'
]
const readyMessage = () => readyMessages[Math.floor(Math.random() * readyMessages.length)]

// just a generic message if the bot doesn't have a specific action to do
const genericMessages = [
    'Oei. Dat snap ik niet. sowwy (>人<)',
    '(>人<) (>人<)',
    'Ik ben niet helemaal mee. uwu',
    'Haha, grappig! Denk ik. Mijn algoritme staat nog niet op punt.',
    'lol',
    '💩',
    'Ik ga iemand anders laten antwoorden hierop.',
    'Lo siento pero solo hablo español. jajajajaja',
    'Neen.',
    'Zeker. Nog niet zo lang maar nu wel.',
    'Denk het wel.',
    'Ik doe mijn best, zoals iedereen bij Intix! (▰˘◡˘▰)',
    'Kan even niet -- mijn hamster is weer ontsnapt smh',
    'Ben aan het ballchasen in Rocket League brrruhh',
]
const genericMessage = () => genericMessages[Math.floor(Math.random() * genericMessages.length)]

// messages to announce the bot will now listen for followup messages
const helloMessages = [
    'Waddup gamer! Over wie wil je wat weten? 🤓',
    'Hallo! Wiens info zal ik vandaag voorschotelen? 🧑‍🍳',
    'Sup gamer. Wie zal ik voor je opzoeken? 🙂',
]
const helloMessage = () => helloMessages[Math.floor(Math.random() * helloMessages.length)]

// messages to announce the bot will no longer listen for followup messages
const leavingMessages = [
    'Ok. Ik ben er dan eens mee weg. 👋',
    'Alright. @me maar als ik nog van dienst kan zijn!',
    'My job is done. Laterz',
    'Tot later, boyz 😎',
]
const leavingMessage = () => leavingMessages[Math.floor(Math.random() * leavingMessages.length)]

// messages to prefix the embed with employee info with
const hrMessages = [
    'Hier is <@#>s fiche:',
    'Dit weten we over <@#>:',
    'Ah, <@#>: een favoriet bij HR. 😉',
]
const hrMessage = userId => hrMessages[Math.floor(Math.random() * hrMessages.length)].replace('#', userId)

// messages when an employee lookup yielded no results
const hrFailMessages = [
    'Hmm... We hebben geen info over <@#>. Zal ook een bot zijn.  ¯\\_(ツ)_/¯',
    'Vind niets terug over <@#>. Ik zal eens informeren bij mijn collega Yardena!',
    'Ik zie dat de scrapebots nog bezig zijn met gatheren van <@#>\s info.',
]
const hrFailMessage = userId => hrFailMessages[Math.floor(Math.random() * hrFailMessages.length)].replace('#', userId)

// messages when it's an empoloyee's birthday
const birthdayMessages = [
    'Fijne verjaardag <@#>! 🥳',
    'Van harte gefeliciteerd met je verjaardag, <@#>! 👯‍♀️',
    '<@#> is jarig vandaag, boyz. Proficiat! 🎂',
]
const birthdayMessage = userId => birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)].replace('#', userId)

// delay to eg. have "realistic" messages being typed
const minDelay = 1000
const maxDelay = 6000
const randomDelay = () => new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (maxDelay - minDelay) + minDelay)))

// channel to keep listening to without being mentioned
let activeChannel = null
let activeChannelTimeout = null
const followChannel = channel => {
    console.log('Waiting for followup messages in', channel.name)
    if (activeChannelTimeout) {
        clearTimeout(activeChannelTimeout)
    }
    activeChannel = channel
    client.user.setActivity(`${channel.name}!`, { type: 'LISTENING' })
    activeChannelTimeout = setTimeout(() => stopFollowing(), 90000)
}
const stopFollowing = async silently => {
    console.log('No longer following ', activeChannel?.name)
    if (activeChannelTimeout) {
        clearTimeout(activeChannelTimeout)
    }
    if (activeChannel) {
        if (!silently) {
            activeChannel.startTyping()
            await randomDelay()
            activeChannel.stopTyping()
            activeChannel.send(leavingMessage())
        }
        activeChannel = null
        client.user.setActivity('all mentions!', { type: 'LISTENING' })
    }
}

// function to create beautiful embeds with employee info
const createEmbed = user => {
    return new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setTitle(user.name)
        .setURL(user.url)
        .setThumbnail(user.photo)
        .setDescription(user.description)
        .addField('Pluspunt', user.strength)
        .addField('Minpuntje', user.weakness)
}

// function to handle a new message to the bot
const handleNewMessage = async message => {
    if (message.mentions.has(client.user.id)) {
        console.log('New message and bot was mentioned in', message.channel.name)

        await randomDelay()
        message.channel.startTyping()
        await randomDelay()
        message.channel.stopTyping()

        const mentions = [...(message.mentions.users.filter(user => !user.bot).keys())]

        if (mentions.length === 0) {
            if (!message.content.match(/hello|hallo|hoi|hey|dag|yo/mi)) {
                message.channel.send(genericMessage())
                return
            }
            message.channel.send(helloMessage())
        }

        mentions.forEach(mention => handleMention(mention, message.channel))
        followChannel(message.channel)
    } else {
        console.log('New message but bot was not mentioned in', message.channel.name)
    }
}

// funtion to handle a followup message to the bot
const handleFollowUpMessage = async message => {
    const mentions = [...(message.mentions.users.filter(user => !user.bot).keys())]

    if (mentions.length) {
        console.log('Followup message with mentions!')

        await randomDelay()
        message.channel.startTyping()
        await randomDelay()
        message.channel.stopTyping()

        mentions.forEach(mention => handleMention(mention, message.channel))
        followChannel(message.channel)
    } else {
        console.log('Followup message but no mentions.')
    }
}

// function to handle mentions (so it is reusable)
const handleMention = (userId, channel) => {
    const user = db.get('users')
        .find({ id: userId })
        .value()

    if (user) {
        channel.send(hrMessage(userId))
        channel.send(createEmbed(user))
    } else {
        channel.send(hrFailMessage(userId))
    }
}

const checkBirthdays = () => {
    const date = new Date()
    const today = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
    const users = db.get('users')
        .filter(user => today === user.birthday?.substr(5))
        .value()

    console.log(`Found ${users.length} user(s) with a known birthday on ${today}`)
    users.forEach(async user => {
        const message = await lobby.send(birthdayMessage(user.id))
        message.react('🥳')
        message.react('🎂')
        message.react('🎉')
        message.react('🎈')
    })
}

// Discord listeners
client.on('message', async message => {
    if (message.author.bot || message.content.includes('@here') || message.content.includes('@everyone'))
        return false

    if (message.channel.id === activeChannel?.id)
        return handleFollowUpMessage(message)

    return handleNewMessage(message)
})

// cron
cron.schedule(env.cron, () => {
    checkBirthdays()
})

// Let's go
console.log('Ready!')
client.user.setActivity('all mentions!', { type: 'LISTENING' })
if (env.readyMessage) lobby.send(readyMessage()).then(msg => msg.react('👍'))
