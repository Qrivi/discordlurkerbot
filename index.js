require('dotenv').config()

const Discord = require('discord.js')

const margin = 30 * 60000 // time to remember games in ms
const memory = {}
const blacklist = ['BattleEye Launcher']

const gameRoles = {
    game356877880938070016: '695291606093267054', // Steam Rocket League
    game11111111111: '695290745216565308' // Fortnite
}

const prefixes = [
    'Heads up!',
    'Ding!',
    'PSA:',
    'Wholla.',
    'Beep beep.'
]
const prefix = () => prefixes[Math.floor(Math.random() * prefixes.length)]

const gameQuotes = [
    'Why not team up?',
    'GLHF!',
    'Only Ws today.',
    'Let\'s get this bread.',
    'Don\'t forget the salt.'
]
const gameQuote = () => gameQuotes[Math.floor(Math.random() * gameQuotes.length)]

const voiceQuotes = [
    'Such a sweet voice!',
    'Go say hi!',
    'Good vibes only.',
    'Come share your secrets.'
]
const voiceQuote = () => voiceQuotes[Math.floor(Math.random() * voiceQuotes.length)]

const client = new Discord.Client()
client.once('ready', () => {
    console.log('Ready!')
    client.user.setActivity('server activity', { type: 'LISTENING' })
})

client.login(process.env.DISCORD_TOKEN)
    .then(() => client.guilds.cache.first().fetch())
    .then(guild => guild.channels.cache.find(channel => channel.id === process.env.DISCORD_CHANNEL).fetch())
    .then(channel => {
        client.on('voiceStateUpdate', (oldState, newState) => {
            if (!oldState.channelID && newState.channelID) {
                console.log(`${prefix()} ${newState.member.displayName} joined the ${newState.channel.name} voice channel! ${voiceQuote()}`)
                channel.send(`${prefix()} <@${newState.member.id}> joined the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
            } else if (oldState.channelID && !newState.channelID) {
                console.log(`${oldState.member.displayName} left the ${oldState.channel.name} voice channel!`)
            } else if (oldState.channelID && newState.channelID && oldState.channelID !== newState.channelID) {
                console.log(`${prefix()} ${newState.member.displayName} switched to the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
                channel.send(`${prefix()} <@${newState.member.id}> switched to the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
            } else if (oldState.channelID === newState.channelID && !oldState.streaming && newState.streaming) {
                console.log(`${prefix()} ${newState.member.displayName} started streaming in the **${newState.channel.name}** voice channel!`)
                channel.send(`${prefix()} <@${newState.member.id}> started streaming in the **${newState.channel.name}** voice channel!`)
            } else {
                console.log('That was something else...')
                // console.log(oldState)
                // console.log(newState)
            }
        })

        client.on('presenceUpdate', (oldPresence, newPresence) => {
            if (newPresence.member.user.bot) return // user is a bot

            const activity = newPresence.activities.find(activity => activity.type === 'PLAYING')
            if (!activity) return // activity was LISTENING or something else

            console.log('# new PLAYING activity:', activity.applicationID)
            // console.log(activity)

            const oldMemory = memory[`user${newPresence.member.id}`]
            memory[`user${newPresence.member.id}`] = {
                game: activity && activity.name ? activity.name.trim() : 'not playing anymore',
                date: new Date()
            }

            console.log('old memory:', oldMemory)
            console.log('new memory:', memory[`user${newPresence.member.id}`])

            if (!activity.name || blacklist.includes(activity.name.trim())) {
                console.log(member.displayName, 'is not playing anymore or playing blacklisted name!')
            } else if (!oldMemory // User just started playing a new game
                || oldMemory.game.toUpperCase() !== activity.name.trim().toUpperCase() // User started playing a different game than last time
                || new Date(oldMemory.date.getTime() + margin) < new Date()) { // User might have started playing the same game, but enough time has passed
                const gameRole = gameRoles[`game${activity.applicationID}`]
                const game = gameRole ? `<@&${gameRole}>` : `**${activity.name.trim()}**`
                console.log(`${prefix()} ${newPresence.member.displayName} started playing ${activity.name.trim()}! ${gameQuote()}`)
                channel.send(`${prefix()} <@${newPresence.member.id}> started playing ${game}! ${gameQuote()}`)
            } else {
                console.log(`${newPresence.member.displayName} is still playing the same game.`)
            }
        })
    })
