import * as dotenv from 'dotenv'
import Discord from 'discord.js'
// import cron from 'node-cron' -- soon™️
import lowdb from 'lowdb'
import { default as FileSync } from 'lowdb/adapters/FileSync.js'

// config environment
dotenv.config()
const client = new Discord.Client()
const db = lowdb(new FileSync('db.json'))
db.defaults({ streaks: [], events: [] })
    .write()
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

// Function that will define what message to send if a voice channel update occurs
const getVoiceUpdate = (oldState, newState) => {
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
        return `${messagePrefix()} <@${newState.member.id}> joined the **${newState.channel.name}** voice channel! ${voiceSuffix()}`
    }
    if (oldState.channelID && newState.channelID && oldState.channelID !== newState.channelID) {
        console.log(`${newState.member.displayName} switched to ${newState.channel.name}`)
        return `${messagePrefix()} <@${newState.member.id}> switched to the **${newState.channel.name}** voice channel! ${voiceSuffix()}`
    }
    if (oldState.channelID === newState.channelID && !oldState.streaming && newState.streaming) {
        console.log(`${newState.member.displayName} is streaming in ${newState.channel.name}`)
        return `${messagePrefix()} <@${newState.member.id}> started streaming in the **${newState.channel.name}** voice channel!`
    }

    console.warn('⚠️ Received unknown voiceStateUpdate')
    // console.log(oldState)
    // console.log(newState)
}

// Function that will define what message to send if a user started playing a game
const getActivity = presence => {
    if (presence.member.user.bot) return  // User is a bot

    const activity = presence.activities.find(activity => activity.type === 'PLAYING')
    if (!activity || !activity.name || blacklist.includes(activity.name.trim())) return

    const oldActivity = gameMemory[`user${presence.member.id}`]
    const newActivity = {
        userID: presence.member.id,
        game: activity.name?.trim(),
        details: activity.details?.trim(),
        date: new Date(),
    }
    gameMemory[`user${presence.member.id}`] = newActivity

    console.log(`Activity update for ${presence.member.displayName}: (${newActivity.date})`)
    console.log(`  Old activity: ${oldActivity?.game} (${oldActivity?.details})`)
    console.log(`  New activity: ${newActivity?.game} (${newActivity?.details})`)

    if (newActivity.game === oldActivity?.game && newActivity.date < new Date(oldActivity.date.getTime() + gameTimeout)) {
        console.log('  Still playing the same game -- aborting')
        return
    }

    const role = roles.find(r => r.game === newActivity.game)
    const game = role ? `<@&${role.id}>` : `**${newActivity.game}**`
    console.log('  Playing a new game -- sending update')
    newActivity.message = `${messagePrefix()} <@${presence.member.id}> started playing ${game}! ${gameSuffix()}`
    return newActivity
}

// Function to calculate daily streak based on an activity update
const getStreak = activity => {
    if (!activity) return

    const today = new Date()
    today.setHours(0)
    today.setMinutes(0)
    today.setSeconds(0, 0)
    const streak = db.get('streaks')
        .find({
            userID: activity.userID,
            game: activity.game
        })
        .value()

    if (!streak) { // User has no streak for this game
        db.get('streaks')
            .push({
                userID: activity.userID,
                game: activity.game,
                day: today,
                count: 1,
            })
            .write()

        console.log(`Streak for ${activity.game} created`)
        return {
            count: 1,
            message: `Looks like it's your first time playing. Good luck, gamer!`,
        }
    }

    const thisTime = today.getTime()
    const lastTime = new Date(streak.day).getTime()
    if (thisTime === lastTime) {
        console.log(`Streak for ${activity.game} already upped today`)
        return
    }

    if (thisTime - lastTime !== 86400000) { // Last streak update was not yesterday
        streak.day = today
        streak.count = 1
        db.write()

        console.log(`Streak for ${activity.game} was reset to 1`)
        return {
            count: 0, // special case: 0 if streak was lost, 1 if playing for first time
            message: `Aww. Your streak was broken!`,
        }
    }

    streak.day = today
    streak.count++
    db.write()

    console.log(`Streak for ${activity.game} was upped to ${streak.count}`)
    return {
        count: streak.count,
        message: `That's a ${streak.count} day streak!`,
    }
}

// Function that determines which reaction the bot will post to its streak update message
const reactToStreakCount = (message, count) => {
    switch (count) {
        case 0: // lost streak
            return message.react('🇫')
        case 1: // first time playing ever
            return message.react('👍')
        case 2:
            return message.react('🏅')
        case 3:
            return message.react('🥉')
        case 4:
            return message.react('🥈')
        case 5:
            return message.react('🥇')
        case 6:
            return message.react('🎖')
        case 7:
            return message.react('🏆')
        case 100: // special gamer here
            return message.react('💯')
        default: // default for over a week streak
            return message.react('👑')
    }
}

// Discord listeners
client.on('message', message => {
    if (message.channel.id === env.channelID && message.member.id === client.user.id) { // Message from this bot
        const player = message.mentions?.users?.first()
        if (!player) return // Not an activity update message

        message.react('❌')
        message.awaitReactions((reaction, user) => user.id == player.id && reaction.emoji.name == '❌', { max: 1, time: 60000 }).then(collection => {
            if (collection.first()) message.delete() // Triggered because of reaction
            else message.reactions.cache.get('❌').remove() // Triggered because of timeout
        })
    }
})

client.on('voiceStateUpdate', (oldState, newState) => {
    const update = getVoiceUpdate(oldState, newState)
    if (update) updateChannel.send(`${update}`)
})

client.on('presenceUpdate', (oldPresence, newPresence) => {
    const activity = getActivity(newPresence)
    const streak = getStreak(activity)

    if (activity) {
        if (streak) updateChannel.send(`${activity.message}\n${streak.message}`).then(message => { reactToStreakCount(message, streak.count) })
        else updateChannel.send(`${activity.message}`)
    }
})

// Let's go
client.user.setActivity('server activity!', { type: 'LISTENING' })
console.log('Ready!')
