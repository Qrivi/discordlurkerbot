require('dotenv').config()

const Discord = require('discord.js')

const prefixes = [
    'Heads up!',
    'Ding!',
    'PSA!'
]
const prefix = () => prefixes[Math.floor(Math.random() * prefixes.length)]

const gameQuotes = [
    'Why not team up?',
    'GLHF!',
    'Only Ws today.'
]
const gameQuote = () => gameQuotes[Math.floor(Math.random() * gameQuotes.length)]

const voiceQuotes = [
    'Such a sweet voice!',
    'Go say hi!',
    'Good vibes only.'
]
const voiceQuote = () => voiceQuotes[Math.floor(Math.random() * voiceQuotes.length)]

const client = new Discord.Client()
client.once('ready', () => {
    console.log('Ready!')
    client.user.setActivity('server activity', { type: 'LISTENING' })
})

client.login(process.env.DISCORD_TOKEN)
    .then(() => client.guilds.cache.first().fetch() )
    .then(guild => guild.channels.cache.find(channel => channel.id === process.env.DISCORD_CHANNEL))
    .then(channel => {
        client.on('voiceStateUpdate', (oldState, newState) => {
            if (!oldState.channelID && newState.channelID) {
                console.log(`${prefix()} <@${newState.member.id}> joined the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
                channel.send(`${prefix()} <@${newState.member.id}> joined the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
            } else if (oldState.channelID && !newState.channelID) {
                console.log(`${oldState.member.displayName} left the ${oldState.channel.name} voice channel!`)
            } else if (oldState.channelID && newState.channelID && oldState.channelID !== newState.channelID) {
                console.log(`${prefix()} <@${newState.member.id}> switched to the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
                channel.send(`${prefix()} <@${newState.member.id}> switched to the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
            } else if (oldState.channelID === newState.channelID && !oldState.streaming && newState.streaming) {
                console.log(`${prefix()} <@${newState.member.id}> started streaming in the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
                channel.send(`${prefix()} <@${newState.member.id}> started streaming in the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
            } else {
                console.log('That was something else...')
                // console.log(oldState)
                // console.log(newState)
            }
        })

        client.on('presenceUpdate', (oldPresence, newPresence) => {
            const newGame = newPresence.activities.find(activity => activity.type === 'PLAYING')

            if (newPresence.member.user.bot || !newGame) return

            const oldGame = oldPresence.activities.find(activity => activity.type === 'PLAYING')

            if (!oldGame || oldGame.name !== newGame.name) {
                channel.send(`${prefix()} <@${newPresence.member.id}> started playing **${newGame.name}**! ${gameQuote()}`)
            }
        })
    })
