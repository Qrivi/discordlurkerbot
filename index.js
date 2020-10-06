require('dotenv').config()

const Discord = require('discord.js')

const margin = 30 * 60000 // time to remember games in ms
const memory = {}
const blacklist = ['BattleEye Launcher']

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
                console.log(`${prefix()} <@${newState.member.displayName}> joined the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
                channel.send(`${prefix()} <@${newState.member.id}> joined the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
            } else if (oldState.channelID && !newState.channelID) {
                console.log(`${oldState.member.displayName} left the ${oldState.channel.name} voice channel!`)
            } else if (oldState.channelID && newState.channelID && oldState.channelID !== newState.channelID) {
                console.log(`${prefix()} <@${newState.member.displayName}> switched to the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
                channel.send(`${prefix()} <@${newState.member.id}> switched to the **${newState.channel.name}** voice channel! ${voiceQuote()}`)
            } else if (oldState.channelID === newState.channelID && !oldState.streaming && newState.streaming) {
                console.log(`${prefix()} <@${newState.member.displayName}> started streaming in the **${newState.channel.name}** voice channel!`)
                channel.send(`${prefix()} <@${newState.member.id}> started streaming in the **${newState.channel.name}** voice channel!`)
            } else {
                console.log('That was something else...')
                // console.log(oldState)
                // console.log(newState)
            }
        })

        client.on('presenceUpdate', (oldPresence, newPresence) => {
            const newGame = newPresence.activities.find(activity => activity.type === 'PLAYING')
            if (newPresence.member.user.bot) return // user is a bot
            console.log(`# <@${newPresence.member.displayName}> opened ${newGame.name}`)
            
            const oldMemory = memory[newPresence.member.id]
            memory['user' + newPresence.member.id] = {
                game: newGame ? newGame.name.trim() : 'not playing anymore',
                date: new Date()
            }
            
            console.log('# old memory:')
            console.log(oldMemory)
            console.log('# new memory:')
            console.log(memory['user' + newPresence.member.id])

            if (!newGame || blacklist.includes(newGame)) return

            if (!oldMemory || oldMemory.game.toUpperCase() !== newGame.name.trim().toUpperCase() || new Date(oldMemory.date.getTime() + margin) < new Date()) {
                console.log(`${prefix()} <@${newPresence.member.displayName}> started playing **${newGame.name}**! ${gameQuote()}`)
                channel.send(`${prefix()} <@${newPresence.member.id}> started playing **${newGame.name}**! ${gameQuote()}`)
            }
            // if we get here the user must still be playing the same game
        })
    })
