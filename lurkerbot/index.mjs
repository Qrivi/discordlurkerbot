import * as dotenv from 'dotenv'
import Discord from 'discord.js'
import cron from 'node-cron'
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
const env = process.env.DISCORD_ENV?.trim().toUpperCase() === 'PRD'
    ? {
        token: process.env.DISCORD_LURKER_TOKEN?.trim(),
        timeZone: process.env.DISCORD_TIMEZONE?.trim(),
        morningSchedule: process.env.DISCORD_MORNING_SCHEDULE?.trim(),
        updateChannelID: process.env.DISCORD_UPDATE_CHANNEL_PRD?.trim(),
        eventChannelID: process.env.DISCORD_EVENT_CHANNEL_PRD?.trim(),
        adminChannelID: process.env.DISCORD_ADMIN_CHANNEL_PRD?.trim(),
    }
    : {
        token: process.env.DISCORD_LURKER_TOKEN?.trim(),
        timeZone: process.env.DISCORD_TIMEZONE?.trim(),
        morningSchedule: process.env.DISCORD_MORNING_SCHEDULE?.trim(),
        updateChannelID: process.env.DISCORD_UPDATE_CHANNEL_DEV?.trim(),
        eventChannelID: process.env.DISCORD_EVENT_CHANNEL_DEV?.trim(),
        adminChannelID: process.env.DISCORD_ADMIN_CHANNEL_DEV?.trim(),
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
const eventChannel = await intix.channels.cache.find(channel => channel.id === env.eventChannelID)?.fetch()
if (!eventChannel) {
    console.error('The event channel defined in the environment does not exist')
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

// Function that will check if there are events planned for today and inform the group

// Function to create beautiful embeds with event info
const createEmbed = async event => {
    const spacer = ' \u200B \u200B \u200B'
    const dateAsString = `${event.date?.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: env.timeZone })} ${env.timeZone}`

    const acceptedList = (event.accepted?.length ? event.accepted.map(userID => `> <@${userID}>`).join('\n') : '> No one yet') + '\n\u200B'
    const declinedList = (event.declined?.length ? event.declined.map(userID => `> <@${userID}>`).join('\n') : '> No one yet') + '\n\u200B'
    const tentativeList = (event.tentative?.length ? event.tentative.map(userID => `> <@${userID}>`).join('\n') : '> No one yet') + '\n\u200B'

    return new Discord.MessageEmbed()
        .setColor('#ff0000')
        .setTitle(event.name)
        .setDescription(event.description ? `**${dateAsString}**\n\n${event.description}\n\u200B` : `**${dateAsString}**\n\u200B`)
        .addField(`:green_circle: Accepted (${event.accepted?.length ?? 0})${spacer}`, acceptedList, true)
        .addField(`:red_circle: Declined (${event.declined?.length ?? 0})${spacer}`, declinedList, true)
        .addField(`:yellow_circle: Tentative (${event.tentative?.length ?? 0})${spacer}`, tentativeList, true)
        .setFooter(`RSVP by reacting below — event ID: ${event.eventID}`)
}

// Function to parse message parts into event date
const parseToEvent = messageParts => {
    return {
        eventID: Date.now().toString(),
        name: messageParts.find(part => /^name:.+/i.test(part))?.substring(5).trim(),
        description: messageParts.find(part => /^description:.+/i.test(part))?.substring(12).trim(),
        date: new Date(messageParts.find(part => /^date:.+/i.test(part))?.substring(5).trim()),
    }
}

// Function to list all the events that are currently in the database
const listEvents = () => {
    const events = db.get('events').value()

    if (events?.length) {
        adminChannel.send('These are the `id`s of events that exist in the database right now:' + events.map(event => `\n- \`${event.eventID}\` (${event.name}, ${event.date})`))
    } else {
        adminChannel.send('There are no events in the database right now.')
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
        .push({ organizerID: organizer.id, ...eventData, accepted: [], declined: [], tentative: [] })
        .write()

    await adminChannel.send('The following event was created:', await createEmbed(eventData))
    adminChannel.send(`Mention me and let me know whether you want to:\n- \`update event ${eventData.eventID}\`\n- \`delete event ${eventData.eventID}\`\n- \`publish event ${eventData.eventID}\``)
}

// Function to update an event based on the message that was passed through
const updateEvent = async (messageParts, organizer) => {
    const eventData = parseToEvent(messageParts)
    const eventID = messageParts[0].match(/^.*update event (\d+).*$/i)?.[1]
    const event = db.get('events').find({ eventID }).value()

    if (!event) {
        adminChannel.send(`That won't work: there is no event with ID \`${eventID}\`.`)
        return
    }

    if (messageParts.length === 1) {
        adminChannel.send(`That won't work: you did not list any modifications to perform.`)
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

// Function to delete an event from the database
const deleteEvent = async messageParts => {
    const eventID = messageParts[0].match(/^.*delete event (\d+).*$/i)?.[1]
    const events = db.get('events').remove({ eventID }).write()

    if (events.length !== 1) {
        adminChannel.send(`That won't work: there is no event with ID \`${eventID}\`.`)
        return
    }

    adminChannel.send(`Poof! That event (${events[0].name}, ${events[0].date}) is now gone forever.`)
}

// Function to preview an event embed
const previewEvent = async messageParts => {
    const eventID = messageParts[0].match(/^.*preview event (\d+).*$/i)?.[1]
    const event = db.get('events').find({ eventID }).value()

    if (!event) {
        adminChannel.send(`That won't work: there is no event with ID \`${eventID}\`.`)
        return
    }

    event.date = new Date(event.date)

    await adminChannel.send('That event currently looks as follows:', await createEmbed(event))
    adminChannel.send(`Mention me and let me know whether you want to:\n- \`update event ${event.eventID}\`\n- \`delete event ${event.eventID}\`\n- \`publish event ${event.eventID}\``)
}

// Function to publish an event embed
const publishEvent = async messageParts => {
    const eventID = messageParts[0].match(/^.*publish event (\d+).*$/i)?.[1]
    const event = db.get('events').find({ eventID }).value()

    if (!event) {
        adminChannel.send(`That won't work: there is no event with ID \`${eventID}\`.`)
        return
    }

    event.date = new Date(event.date)

    const message = await eventChannel.send(`${messagePrefix()} <@${event.organizerID}> scheduled a new event:`, await createEmbed(event))
    await message.react('🟢')
    await message.react('🔴')
    await message.react('🟡')

    adminChannel.send('Done.')
}

// Function that will update the event embed to reflect latest database changes
const refreshMessage = async messageParts => {
    const messageID = messageParts[0].match(/^.*refresh message (\d+).*$/i)?.[1]
    const message = await eventChannel.messages.fetch(messageID)

    if (!message) {
        adminChannel.send(`That won't work: there is no message with ID \`${messageID}\` in the update channel.`)
        return
    }

    adminChannel.send(await updateEmbed(message) ? 'Done.' : 'Hmmm... Something went wrong.')
}

// Function that will actually look for the message to update, and update its embed
const updateEmbed = async message => {
    const eventID = message?.embeds?.[0]?.footer?.text?.slice(-13)
    if (!eventID || message.channel.id !== env.eventChannelID || message.author.id !== client.user.id)
        return false

    const event = db.get('events').find({ eventID }).value()
    if (!event)
        return false

    event.date = new Date(event.date)

    await message.edit(await createEmbed(event))
    return true
}

// Sends an informative message on how to use the bot
const sendHelp = async () => {
    await adminChannel.send(
        'I have recently gained functionality to help admins schedule and organize events! 🥳\n' +
        'You can mention me in the admin channel and use the following commands:\n' +
        '\u200B\n' +
        '`list events`\n' +
        '> This will list the `eventid`s of all the events that currently exist in the database.\n' +
        '`new event`\n' +
        '> This will add a new event to the database. You will need to include a `name` and a `date`, and optionally a `description`, as arguments.\n' +
        '`update event [eventid]`\n' +
        '> This will update an existing event with matching `eventid` with the new data passed as arguments.\n' +
        '`delete event [eventid]`\n' +
        '> This will remove the event with matching `eventid` from the database.\n' +
        '`preview event [eventid]`\n' +
        '> This will show a preview of the event with matching `eventid` in the admin channel.\n' +
        '`publish event [eventid]`\n' +
        '> This will publish the event with matching `eventid` to the update channel so gamers can RSVP.\n' +
        '`refresh message [messageid]`\n' +
        '> This will update the message embed of the message with matching `messageid` with the latest data from the database. This is useful if you only recently published an event but then changed its ' +
        'details (so you don\'t have to delete the message and publish again).\n' +
        '\u200B\n'
    )
    await adminChannel.send(
        'ℹ️ As you can see, `new event` and `update event` require you to pass event data as arguments. Data is passed by adding a new line under your command in the same message (Shift+Enter, or copy ' +
        'and paste from the notes app if you\'re on your phone I suppose). The argument\'s key will be parsed from the start of the line till the first colon, and everything after that colon till the ' +
        'end of the line will be considered the argument\'s value.\n' +
        'Keys are case insensitive and values are trimmed. You can\'t add a backtick or dash or even space as the first character of an argument as the key won\'t match.\n' +
        '\u200B\n' +
        'You can use this example to try me out (don\'t forget to `delete event` afterwards to keep the database clean):\n' +
        '```\n@Gamer Alert new event\nname: JackBox Party\ndate: 31 Dec 2021 19:30:00 GMT+2\ndescription: Kom jij ook spelletjes spelen met je collega\'s?```'
    )
}

// Sends a message that the bot did not understand what it is supposed to do
const sendDoNotUnderstand = () => {
    adminChannel.send('I did not understand that.\nIf you want to know what I can do, mention me and say "help".')
}

// Makes a message removable if the concerned user reacts with a ❌
const makeRemovable = message => {
    message.awaitReactions((reaction, user) => user.id == message.mentions?.users?.first().id && reaction.emoji.name == '❌', { max: 1, time: 60000 }).then(collection => {
        if (collection.first()) message.delete() // Triggered because of reaction
        else message.reactions.cache.get('❌').remove() // Triggered because of timeout
    })
    message.react('❌')
}

// Given an event, puts userID in the right queue
const rsvp = (event, queue, userID) => {
    const didAcceptBefore = event.accepted.indexOf(userID)
    if (didAcceptBefore !== -1) event.accepted.splice(didAcceptBefore, 1)
    const didDeclineBefore = event.declined.indexOf(userID)
    if (didDeclineBefore !== -1) event.declined.splice(didDeclineBefore, 1)
    const didTentativeBefore = event.tentative.indexOf(userID)
    if (didTentativeBefore !== -1) event.tentative.splice(didTentativeBefore, 1)

    queue.push(userID)
}

const checkEvents = () => {
    // todo
}

// Discord listeners
client.on('message', async message => {
    if (message.channel.id === env.adminChannelID && message.mentions.has(client.user.id)) { // Message from an admin to this bot
        const messageParts = message.content.split('\n')

        if (/^.*help.*$/i.test(messageParts[0])) {
            return sendHelp()
        }
        if (/^.*list events.*$/i.test(messageParts[0])) {
            return listEvents()
        }
        if (/^.*new event.*$/i.test(messageParts[0])) {
            return createEvent(messageParts, message.author)
        }
        if (/^.*update event \d+.*$/i.test(messageParts[0])) {
            return updateEvent(messageParts, message.author)
        }
        if (/^.*delete event \d+.*$/i.test(messageParts[0])) {
            return deleteEvent(messageParts)
        }
        if (/^.*preview event \d+.*$/i.test(messageParts[0])) {
            return previewEvent(messageParts)
        }
        if (/^.*publish event \d+.*$/i.test(messageParts[0])) {
            return publishEvent(messageParts)
        }
        if (/^.*refresh message \d+.*$/i.test(messageParts[0])) {
            return refreshMessage(messageParts)
        }
        return sendDoNotUnderstand()
    }
})

client.on('messageReactionAdd', (reaction, user) => {
    if (user.bot || reaction.message.channel.id !== env.eventChannelID) return

    if (reaction.message.embeds?.length) { // Must be a published event update
        const eventID = reaction.message.embeds[0].footer.text.slice(-13)
        const event = db.get('events').find({ eventID }).value()
        console.log(`Received a ${reaction.emoji.name} for event with ID ${eventID}`)

        if (!event) {
            adminChannel.send(`Heads up! Someone is RSVPing to an event that does not exist in the database (anymore?).\nConsider removing the embed for event \`${eventID}\` in the updates channel.`)
            return
        }

        switch (reaction.emoji.name) {
            case '🟢':
                console.log(`  ${user.username} RSVPed as accepted`)
                rsvp(event, event.accepted, user.id)
                break
            case '🔴':
                console.log(`  ${user.username} RSVPed as declined`)
                rsvp(event, event.declined, user.id)
                break
            case '🟡':
                console.log(`  ${user.username} RSVPed as tentative`)
                rsvp(event, event.tentative, user.id)
                break
            default:
                return
        }

        reaction.users.remove(user.id)
        db.write()
        updateEmbed(reaction.message)
    }
})

client.on('voiceStateUpdate', async (oldState, newState) => {
    const update = getVoiceUpdate(oldState, newState)
    if (update) makeRemovable(await updateChannel.send(`${update}`))
})

client.on('presenceUpdate', async (oldPresence, newPresence) => {
    const activity = getActivity(newPresence)
    const streak = getStreak(activity)

    if (activity) {
        if (streak) {
            const message = await updateChannel.send(`${activity.message}\n${streak.message}`)
            makeRemovable(message)
            reactToStreakCount(message, streak.count)
        }
        else {
            const message = await updateChannel.send(`${activity.message}`)
            makeRemovable(message)
        }
    }
})

cron.schedule(env.morningSchedule, () => {
    checkEvents()
})
// Let's go
client.user.setActivity('server activity!', { type: 'LISTENING' })
console.log('Ready!')
