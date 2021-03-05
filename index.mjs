import * as dotenv from 'dotenv'
import Discord from 'discord.js'
import cron from 'node-cron'
import lowdb from 'lowdb'
import { default as FileSync } from "lowdb/adapters/FileSync.js"

// config environment
dotenv.config()
const client = new Discord.Client()
// TODO const db = lowdb(new FileSync('db.json'))
const gameMemory = {}
const gameTimeout = 120 /* minutes */ * 60000
const voiceMemory = {}
const voiceTimeout = 30 /* minutes */ * 60000
const blacklist = [
    'BattlEye Launcher',
    'BattleEye Launcher',
    'Visual Studio Code',
    'IntelliJ IDEA Ultimate',
]
const roles = [
    {
        game: 'Rocket League',
        id: '695291606093267054',
    },
    {
        game: 'Fortnite',
        id: '695290745216565308',
    }
]

// Templates
const messagePrefixes = [
    'Heads up!',
    'Ding!',
    'PSA:',
    'Beep beep.',
    'Plopper de plop!',
    'Sapperdepitjes!',
]
const messagePrefix = () => messagePrefixes[Math.floor(Math.random() * messagePrefixes.length)]

const gameSuffixes = [
    'Why not team up?',
    'GLHF!',
    'Only Ws today.',
    'Let\'s get this bread.',
    'Don\'t forget the salt.'
]
const gameSuffix = () => gameSuffixes[Math.floor(Math.random() * gameSuffixes.length)]

const voiceSuffixes = [
    'Such a sweet voice!',
    'Go say hi!',
    'Good vibes only.',
    'Come share your secrets.',
]
const voiceSuffix = () => voiceSuffixes[Math.floor(Math.random() * voiceSuffixes.length)]

// connect beep beep boop
const env = process.env.DISCORD_ENV.trim().toUpperCase() === 'PRD'
    ? {
        token: process.env.DISCORD_TOKEN.trim(),
        channelID: process.env.DISCORD_CHANNEL_PRD.trim(),
    }
    : {
        token: process.env.DISCORD_TOKEN.trim(),
        channelID: process.env.DISCORD_CHANNEL_DEV.trim(),
    }
await client.login(env.token)

const intix = await client.guilds.cache.first()?.fetch() // only active in Intix Discord
if (!intix) {
    console.error('Bot is not active in the Intix Discord server')
    process.exit(1)
}
const updateChannel = await intix.channels.cache.find(channel => channel.id === env.channelID)?.fetch()
if (!updateChannel) {
    console.error('The update channel defined in the environment does not exist')
    process.exit(1)
}

// Discord listeners
client.on('message', message => {
    if (message.channel.id === env.channelID && message.member.id === client.user.id) { // Activity update from this bot
        const player = message.mentions.users.first()

        message.react('❌')
        message.awaitReactions((reaction, user) => user.id == player.id && reaction.emoji.name == '❌', { max: 1, time: 60000 }).then(collection => {
            if (collection.first()) message.delete() // Triggered because of reaction
            else message.reactions.cache.get('❌').remove() // Triggered because of timeout
        })
    }
})

client.on('presenceUpdate', (oldPresence, newPresence) => {
    if (newPresence.member.user.bot) return // User is a bot

    const activity = newPresence.activities.find(activity => activity.type === 'PLAYING')
    if (!activity || !activity.name || blacklist.includes(activity.name.trim())) return

    const oldActivity = gameMemory[`user${newPresence.member.id}`]
    const newActivity = {
        game: activity.name?.trim(),
        details: activity.details?.trim(),
        date: new Date(),
    }
    gameMemory[`user${newPresence.member.id}`] = newActivity

    console.log(`Activity update for ${newPresence.member.displayName}: (${newActivity.date})`)
    console.log(`  Old activity: ${oldActivity?.game} (${oldActivity?.details})`)
    console.log(`  New activity: ${newActivity?.game} (${newActivity?.details})`)

    if (newActivity.game === oldActivity?.game && newActivity.date < new Date(oldActivity.date.getTime() + gameTimeout)) {
        console.log('  Still playing the same game -- aborting')
        return
    }

    const role = roles.find(r => r.game === newActivity.game)
    const game = role ? `<@&${role.id}>` : `**${newActivity.game}**`
    console.log('  Playing a new game -- sending update')
    updateChannel.send(`${messagePrefix()} <@${newPresence.member.id}> started playing ${game}! ${gameSuffix()}`)
})

client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.member.user.bot) return // User is a bot

    const oldUpdate = voiceMemory[`user${newState.member.id}`]
    const newUpdate = {
        channelID: newState.channelID,
        streaming: newState.streaming,
        date: new Date(),
    }

    if (!newUpdate.streaming && newUpdate.channelID === oldUpdate?.channelID && newUpdate.date < new Date(oldUpdate.date.getTime() + voiceTimeout)) {
        console.log(`${oldState.member.displayName} rejoined ${newState.channel.name} (Discord crash or disconnection?)`)
        return
    }
    if (oldState.channelID && !newState.channelID) {
        console.log(`${oldState.member.displayName} left ${oldState.channel.name}`)
        return
    }

    voiceMemory[`user${newState.member.id}`] = newUpdate

    if (!oldState.channelID && newState.channelID) {
        console.log(`${newState.member.displayName} joined ${newState.channel.name}`)
        updateChannel.send(`${messagePrefix()} <@${newState.member.id}> joined the **${newState.channel.name}** voice channel! ${voiceSuffix()}`)
        return
    }
    if (oldState.channelID && newState.channelID && oldState.channelID !== newState.channelID) {
        console.log(`${newState.member.displayName} switched to ${newState.channel.name}`)
        updateChannel.send(`${messagePrefix()} <@${newState.member.id}> switched to the **${newState.channel.name}** voice channel! ${voiceSuffix()}`)
        return
    }
    if (oldState.channelID === newState.channelID && !oldState.streaming && newState.streaming) {
        console.log(`${newState.member.displayName} is streaming in ${newState.channel.name}`)
        updateChannel.send(`${messagePrefix()} <@${newState.member.id}> started streaming in the **${newState.channel.name}** voice channel!`)
        return
    }

    console.warn('⚠️ Received unknown voiceStateUpdate')
    // console.log(oldState)
    // console.log(newState)
})

// Let's go
client.user.setActivity('server activity', { type: 'LISTENING' })
console.log('Ready!')
