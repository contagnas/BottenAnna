import Discord from "discord.js"
import path from "path"
import fs from "fs"
import { convertOpusStringToRawPCM } from './decode_opus'
import { exec }  from 'child_process'

const client = new Discord.Client()
client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

type ListenerState  =
    | { state: "Off" }
    | { state: "Buffering", buffer: string }
    | { state: "Recording", outputFile: fs.WriteStream, filename: string }

let listenerStates: { [member: string]: ListenerState } = {}
let memberStreams: { [member: string]: any } = {}
let connection: Discord.VoiceConnection

const annaChannel = "Boten Anna's Super Fun Chamber of Laughs"

let speaking = false

const listener = async (
    member: Discord.GuildMember,
    data: any
) => {
    let state = listenerStates[member.user.username]
    const hexString = data.toString("hex")
    const silent = hexString == "f8fffe"
    const username = member.user.username

    if (silent && state.state == "Recording") {
        const outputFile = state.outputFile
        const recordingFilename = state.filename
        outputFile.close()

        convertOpusStringToRawPCM(outputFile.path as string, state.filename, (pcmFile) => {
            fs.unlink(outputFile.path, (err) => {})
            const mp3Dir = path.join('recordings', username)
            fs.mkdir(mp3Dir, { "recursive": true }, () => {
                const mp3File = path.join(mp3Dir, recordingFilename + ".mp3")
                const command = (`lame ${pcmFile} ${mp3File}`)
                exec(command, () => {
                    fs.unlink(pcmFile, (err) => {})
                    if (!speaking) {
                        fs.readdir(mp3Dir, (_err, files) => {
 /* `;-.          ___, */   const filesForUser = files.length
   /* `.`\_...._/`.-"` */   if (files.length > 10 && Math.random() > 0.5) {
     /* \        /      , */    speaking = true
     /* /()   () \    .' `-._ */const randomClip = files[Math.floor(Math.random() * filesForUser)];
    /* |)  .    ()\  /   _.' */ const toPlay = path.join(mp3Dir, randomClip)
    /* \  -'-     ,; '. < */    connection.play(toPlay)
     /* ;.__     ,;|   > \ */   .on('close', () => {
    /* / ,    / ,  |.-'.-' */       speaking = false
   /* (_/    (_/ ,;|.<` */      })
     /* \    ,     ;-` */       .on('finish', () => {
      /* >   \    / */              speaking = false
     /* (_,-'`> .' */           })
          /* (_,' */        }
                        })
                    }
                })
            })
        })
    }

    if (silent) {
        listenerStates[username] = { state: "Off" }
        return
    }

    if (state.state == "Off") {
        console.log(`Recording from ${username}`)
        listenerStates[username] = {
            state: "Buffering",
            buffer: `,${hexString}`
        }

        const now = Date.now();
        const outputDir = path.join('./raw_recordings', username)

        fs.mkdir(outputDir, { 'recursive': true }, () => {
            state = listenerStates[username]
            const output = path.join(outputDir, now.toString())
            const fh = fs.createWriteStream(output)

            if (state.state == "Buffering") {
                fh.write(state.buffer)
            } else {
                fh.write(`,${hexString}`)
            }

            listenerStates[username] = {
                state: "Recording",
                outputFile: fh,
                filename: now.toString()
            }
        })
    }

    if (state.state == "Buffering") {
        state.buffer + `,${hexString}`
        listenerStates[username] = {
            state: "Buffering",
            buffer: state.buffer + `,${hexString}`
        }
    }

    if (state.state == "Recording") {
        state.outputFile.write(`,${hexString}`)
    }
}

client.on("ready", () => {
    client.user.setActivity("everything u say", { type: "LISTENING" })
})

const nukeChannels = async (guild: Discord.Guild): Promise<Discord.VoiceChannel> => {
    const category = guild.channels.cache.find(c => 
        c.type === "category" && c.name === "Voice Channels"
    ) || await guild.channels.create("Voice Channels", { type: "category" })

    const channel = (
        guild.channels.cache.find(c =>
            c.name === annaChannel && c.type === "voice"
        ) || await guild.channels.create(annaChannel, { type: "voice", parent: category })
    ) as Discord.VoiceChannel

    if (!connection) {
        connection = await channel.join()
        connection.channel.members.forEach(m => listenToMember(m, connection))
        connection.play("./assets/BotenAnna.mp3")
    }

    guild.members.fetch().then(members => {
        const channelMoves = members
        .filter( member => member.voice.channel !== null)
        .map(async member => {
            try {
                await member.voice.setChannel(channel)
            }
            catch (err) {
                return console.error(`Failed to move ${member.displayName}: ${err}`)
            }
        })
        Promise.all(channelMoves).then(() => {
            guild.channels.cache
                .filter(c => c.type === "voice" && c.name && c.name !== annaChannel)
                .forEach(c => c.delete().catch(err => console.error(`Delete failed: ${err}`)))
        }).catch(() => {})
    })

    return channel
}

const listenToMember = (member: Discord.GuildMember, connection: Discord.VoiceConnection) => {
    if (!memberStreams[member.user.username] && connection && !member.user.bot) {
        console.log(`Opening stream for ${member.user.username}`)

        const stream = connection.receiver.createStream(member.user, {
            mode: "opus",
            end: "manual"
        })

        listenerStates[member.user.username] = { state: "Off" }
        stream.on("data", data => {
            try { listener(member, data) } catch { } 
        })
        memberStreams[member.user.username] = stream
    }
}

client.on("voiceStateUpdate", async (_oldMember, newMember) => {
    const guild = newMember.guild

    const membersChannel = newMember.channel
    const member = newMember.member

    if (member.user == client.user && newMember.serverMute) {
        newMember.setMute(false)
    }

    if (member.user === client.user && !membersChannel) {
        connection = null
    }

    await nukeChannels(guild)

    if (!membersChannel || membersChannel.type !== "voice") {
        if (memberStreams[member.user.username]) {
            console.log(`Deleting stream for ${member.user.username}`)
            memberStreams[member.user.username].destroy()
            delete memberStreams[member.user.username]
        }
        return
    }

    const memberChannelName = membersChannel.name
    if (memberChannelName === annaChannel) {
        listenToMember(member, connection)
        return
    }

})

client.login("DISCORD_TOKEN")

export default client;
