const Discord = require('discord.js')

require('dotenv').config()

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
                console.log(`${newState.member.id} joined the ${newState.channel.name} voice channel!`)
                //channel.send(`<@${newState.member.id}> joined the ${newState.channel.name} voice channel!`)
            } else if (oldState.channelID && !newState.channelID) {
                console.log(`${oldState.member.displayName} left the ${oldState.channel.name} voice channel!`)
            } else if (oldState.channelID && newState.channelID) {
                console.log(`${oldState.member.displayName} left the ${oldState.channel.name} voice channel to join ${newState.channel.name} instead!`)
            } else {
                console.log('That was something else...')
            }
        })

        client.on('presenceUpdate', (oldPresence, newPresence) => {
            const newGame = newPresence.activities.find(activity => activity.type === 'PLAYING')

            if (newPresence.member.user.bot || !newGame) return;

            const oldGame = oldPresence.activities.find(activity => activity.type === 'PLAYING')

            if (newGame !== oldGame) {
                console.log(`${newPresence.userID} started playing ${newGame.name}!`)
            }
        })
    })
