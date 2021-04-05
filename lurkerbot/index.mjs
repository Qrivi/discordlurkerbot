import * as dotenv from 'dotenv'
import Discord from 'discord.js'
// import cron from 'node-cron' -- soon™️
import lowdb from 'lowdb'
import { default as FileSync } from 'lowdb/adapters/FileSync.js'
import { join as joinPath, dirname } from 'path'
import { fileURLToPath } from 'url'

// config environment
dotenv.config()
const client = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] })
const __dirname = dirname(fileURLToPath(import.meta.url))
const db = lowdb(new FileSync(joinPath(__dirname, 'db.json')))
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
        token: process.env.DISCORD_LURKER_TOKEN.trim(),
        timeZone: process.env.DISCORD_TIMEZONE.trim(),
        updateChannelID: process.env.DISCORD_LURKER_CHANNEL_PRD.trim(),
        adminChannelID: process.env.DISCORD_ADMIN_CHANNEL_PRD.trim(),
    }
    : {
        token: process.env.DISCORD_LURKER_TOKEN.trim(),
        timeZone: process.env.DISCORD_TIMEZONE.trim(),
        updateChannelID: process.env.DISCORD_LURKER_CHANNEL_DEV.trim(),
        adminChannelID: process.env.DISCORD_ADMIN_CHANNEL_DEV.trim(),
    }
await client.login(env.token)

const intix = await client.guilds.cache.first()?.fetch() // only active in Intix Discord
if (!intix) {
    console.error('Bot is not active in the Intix Discord server')
    process.exit(1)
}
const updateChannel = await intix.channels.cache.find(channel => channel.id === env.updateChannelID)?.fetch()
if (!updateChannel) {
    console.error('The update channel defined in the environment does not exist')
    process.exit(1)
}
const adminChannel = await intix.channels.cache.find(channel => channel.id === env.adminChannelID)?.fetch()
if (!adminChannel) {
    console.error('The admin channel defined in the environment does not exist')
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
        console.log(`${oldState.member.displayName} rejoined ${newState.channel?.name} (mute/deafen change or reconnected)`)
        return
    }
    if (oldState.channelID && !newState.channelID) {
        console.log(`${oldState.member.displayName} left ${oldState.channel?.name}`)
        return
    }

    voiceMemory[`user${newState.member.id}`] = newUpdate

    if (!oldState.channelID && newState.channelID) {
        console.log(`${newState.member.displayName} joined ${newState.channel?.name}`)
        return `${messagePrefix()} <@${newState.member.id}> joined the **${newState.channel?.name}** voice channel! ${voiceSuffix()}`
    }
    if (oldState.channelID && newState.channelID && oldState.channelID !== newState.channelID) {
        console.log(`${newState.member.displayName} switched to ${newState.channel?.name}`)
        return `${messagePrefix()} <@${newState.member.id}> switched to the **${newState.channel?.name}** voice channel! ${voiceSuffix()}`
    }
    if (oldState.channelID === newState.channelID && !oldState.streaming && newState.streaming) {
        console.log(`${newState.member.displayName} is streaming in ${newState.channel?.name}`)
        return `${messagePrefix()} <@${newState.member.id}> started streaming in the **${newState.channel?.name}** voice channel!`
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
        const lastCount = streak.count
        streak.day = today
        streak.count = 1
        db.write()

        console.log(`Streak for ${activity.game} was reset to 1`)
        if (lastCount === 1) return // no need for a message if "streak" was 1, which isn't really a streak
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

// Function to get text version of a user's gamertag
const getUserName = async (userID, prefix) => {
    const user = await intix.members.fetch(userID)
    return prefix ? prefix + user.displayName : user.displayName
}

// Function to create beautiful embeds with event info
const createEmbed = async (event, accepted, declined, tentative) => {
    const spacer = ' \u200B \u200B \u200B'
    const dateAsString = `${event.date?.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: env.timeZone })} ${env.timeZone}`

    const acceptedList = (accepted?.length ? Promise.all(accepted.map(userID => getUserName(userID, '> • '))).join('\n') : '> No one yet') + '\n\u200B'
    const declinedList = (declined?.length ? Promise.all(declined.map(userID => getUserName(userID, '> • '))).join('\n') : '> No one yet') + '\n\u200B'
    const tentativeList = (tentative?.length ? Promise.all(tentative.map(userID => getUserName(userID, '> • '))).join('\n') : '> No one yet') + '\n\u200B'

    return new Discord.MessageEmbed()
        .setColor('#ff0000')
        .setTitle(event.name)
        .setDescription(event.description ? `**${dateAsString}**\n\n${event.description}\n\u200B` : `**${dateAsString}**\n\u200B`)
        .addField(`:green_circle: Accepted (${accepted?.length ?? 0})${spacer}`, acceptedList, true)
        .addField(`:red_circle: Declined (${declined?.length ?? 0})${spacer}`, declinedList, true)
        .addField(`:yellow_circle: Tentative (${tentative?.length ?? 0})${spacer}`, tentativeList, true)
        .setFooter('RSVP by reacting below')
}

// Function to parse message parts into event date
const parseToEvent = messageParts => {
    return {
        eventID: Date.now(),
        name: messageParts.find(part => /^name:.+/i.test(part))?.substring(5).trim(),
        description: messageParts.find(part => /^description:.+/i.test(part))?.substring(12).trim(),
        date: new Date(messageParts.find(part => /^date:.+/i.test(part))?.substring(5).trim()),
    }
}

// Function to create a new event based on the message that was passed through
const createEvent = async (messageParts, organizer) => {
    const eventData = parseToEvent(messageParts)

    if (!eventData.name || !eventData.name.length) {
        adminChannel.send(`That won't work: your event needs a name.`)
        return
    }
    if (!eventData.date || isNaN(eventData.date.getTime()) || eventData.date.getTime() < new Date().getTime()) {
        adminChannel.send(`That won't work: your event needs a valid date in the future.`)
        adminChannel.send(`> In order to avoid parsing issues, use the ISO 8601 Extended Format, e.g. \`26 Sep 2021 15:00:00 GMT+2\`.`)
        return
    }

    if (db.get('events').find({ eventID: eventData.eventID }).value()) {
        adminChannel.send(`That won't work: an event is already scheduled at that time (see \`preview event ${eventData.eventID}\`).`)
        return
    }

    db.get('events')
        .push({ ...eventData, organizerID: organizer.id })
        .write()

    await adminChannel.send('The following event was created:', await createEmbed(eventData))
    adminChannel.send(`Mention me and let me know whether you want to:\n- \`update event ${eventData.eventID}\`\n- \`delete event ${eventData.eventID}\`\n- \`publish event ${eventData.eventID}\``)
}

// Function to update a new event based on the message that was passed through
const updateEvent = async (messageParts, organizer) => {
    const eventData = parseToEvent(messageParts)
    const eventID = messageParts[0].match(/^.*update event (\d+).*$/i)?.[1]
    const event = db.get('events').find({ eventID: parseInt(eventID) }).value()

    if (!event ) {
        adminChannel.send(`That won't work: there is no event with ID \`${eventID}\`.`)
        return
    }

    if (eventData.name?.length) {
        event.name = eventData.name
        event.organizerID = organizer.id
    }
    if (eventData.description?.length) {
        event.description = eventData.description
        event.organizerID = organizer.id
    }
    if (eventData.date && !isNaN(eventData.date.getTime()) && eventData.date.getTime() > new Date().getTime()) {
        event.date = eventData.date
        event.organizerID = organizer.id
    }

    db.write()
    event.date = new Date(event.date)

    await adminChannel.send('The event was updated as follows:', await createEmbed(event))
    adminChannel.send(`Mention me and let me know whether you want to:\n- \`update event ${event.eventID}\`\n- \`delete event ${event.eventID}\`\n- \`publish event ${event.eventID}\``)
}

// Sends an informative message on how to use the bot
const sendHelp = () => {
    adminChannel.send('Now I would explain how I work')
}

// Sends a message that the bot did not understand what it is supposed to do
const sendDoNotUnderstand = () => {
    adminChannel.send('I did not understand that.\nIf you want to know what I can do, mention me and say "help".')
}

// Discord listeners
client.on('message', message => {
    if (message.channel.id === env.updateChannelID && message.member.id === client.user.id) { // Update message from this bot
        const player = message.mentions?.users?.first()
        if (!player) return // Not an activity update message

        message.react('❌')
        message.awaitReactions((reaction, user) => user.id == player.id && reaction.emoji.name == '❌', { max: 1, time: 60000 }).then(collection => {
            if (collection.first()) message.delete() // Triggered because of reaction
            else message.reactions.cache.get('❌').remove() // Triggered because of timeout
        })
        return
    }
    if (message.channel.id === env.adminChannelID && message.mentions.has(client.user.id)) { // Message from an admin to this bot
        const messageParts = message.content.split('\n')

        if (/^.*help.*$/i.test(messageParts[0])) {
            return sendHelp()
        }
        if (/^.*new event.*$/i.test(messageParts[0])) {
            return createEvent(messageParts, message.author)
        }
        if (/^.*update event \d+.*$/i.test(messageParts[0])) {
            return updateEvent(messageParts, message.author)
        }
        return sendDoNotUnderstand()
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
