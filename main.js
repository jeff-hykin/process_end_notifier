import { Bot } from "https://deno.land/x/telegram@v0.1.1/mod.ts"

import { FileSystem, glob } from "https://deno.land/x/quickr@0.6.42/main/file_system.js"
import { Console, green } from "https://deno.land/x/quickr@0.6.42/main/console.js"
import { returnAsString, run, Stdout } from "https://deno.land/x/quickr@0.6.42/main/run.js"
import { recursivelyAllKeysOf, get, set, remove, merge, compareProperty } from "https://deno.land/x/good@1.4.4.2/object.js"
import { parse } from "https://deno.land/std@0.168.0/flags/mod.ts"
import { format } from "https://deno.land/std@0.198.0/fmt/duration.ts"

const defaultAuthTokenLocation = `${FileSystem.home}/.ssh/default_telegram_bot_token`
const envVarName = `DENO_TELEGRAM_BOT_TOKEN`

const cliOptions = ["token", "processPid", "chatName", "chatId", "checkInterval", "processName"]
const flags = parse(Deno.args, {
    boolean: ["help"],
    string: cliOptions, 
    default: {
        checkInterval: 5000, // miliseconds
    },
})

if (flags.help) {
    console.log(`
NOTE: no arguments are required
      everything will be asked interactively
      (if not given as a argument)

process_end_notifier ${cliOptions.map(each=>`\n      --${each} <string>`).join("")}
    `)
    Deno.exit()
}


const defaultBotTokenPath = `${FileSystem.home}/.ssh/default_telegram_bot_token`
let token = flags.token || Deno.env.get(envVarName) || await FileSystem.read(defaultBotTokenPath)
if (!token) {
    console.log(`Note: I checked the ${envVarName} env var and didn't see a token there`)
    console.log(`Note: I went to ${JSON.stringify(defaultAuthTokenLocation)}, but I didn't see anything there either`)
    console.log(`
        If you don't have an auth token:
        - go to https://t.me/botfather
        - send "/newbot"
        - copy the token out of the response message
    `)
    token = prompt("What's your AUTH token?")
    FileSystem.write({
        path: defaultBotTokenPath,
        data: token,
    })
}

const bot = new Bot(token)

let chatId = flags.chatId-0
if (!chatId) {
    const updates = (await fetch(`https://api.telegram.org/bot${token}/getUpdates`).then(result=>result.json()))?.result || []

    var chatNameToId = {}
    for (const eachUpdateObject of updates) {
        const probablyChatKeys = recursivelyAllKeysOf(eachUpdateObject).filter((keys)=>keys.slice(-1)[0]=="chat")
        for (const keyList of probablyChatKeys) {
            const output = get({ keyList, from: eachUpdateObject })
            // TODO: this might be a bit too strict; I think some users dont have usernames
            if (output instanceof Object && typeof output.id == 'number' && (typeof output.title =='string' || typeof output.username =='string')) {
                const chatName = output.title || output.username
                chatNameToId[chatName] = output.id
            }
        }
    }
    const noChats = Object.keys(chatNameToId).length == 0
    if (noChats) {
        console.log(JSON.stringify(updates,0,4))
        console.log(``)
        console.log(``)
        console.log(``)
        console.log(`Make sure to start a chat with your bot (bots can't create/start a chat)`)
        console.log(`(and for logging purposes, in case I made a mistake, take a look at the json above)`)
        Deno.exit(1)
    }

    let chatName = flags.chatName
    if (chatName) {
        chatId = chatNameToId[chatName]
        if (!chatId) {
            console.log(JSON.stringify(updates,0,4))
            console.log(``)
            console.log(``)
            console.log(``)
            console.log(`I was unable to find the chat id for that chat name`)
            console.log(`Try sending a message in that chat and running this again`)
            console.log(`(and for logging purposes, in case I made a mistake, take a look at the json above)`)
            Deno.exit(1)
        }
    } else {
        while (!chatId) {
            chatName = prompt(`Which chat would you like it to message?\nAvailable chats: ${Object.keys(chatNameToId).join(", ")}`)
            chatId = (chatNameToId[chatName] || chatNameToId[chatName.trim()])-0
            if (!chatId) {
                console.log(`Sorry I didn't see that one. Try copying and pasting the name from the Available chats: ${JSON.stringify(Object.keys(chatNameToId))}`)
            }
        }
        console.log(`great, btw the chatId for that chat is: ${chatId}`)
    }
}

if (!args.processPid) {
    const name = Console.askFor.line("Whats part of the name of the process? (or the whole name)")
    console.log("Here's the process information I have for that:")
    console.log(
        (await run`ps -axww -o pid,command ${Stdout(returnAsString)}`).split("\n").filter(each=>each.match(name)).map(each=>`    ${each.split(/[ \t]+/).map((each,index)=>index==0?green(each):each).join(" ")}`).join("")
    )
    args.processPid = Console.askFor.line("What's the PID of the process you're looking for?")-0
}


let lastObservedTime = 0
console.log(`Okay I am now watching: ${flags.processPid}`)
const startTime = (new Date()).getTime()
setInterval(async ()=>{
    try {
        const status = await run`ps -p ${flags.processPid} ${Stdout(returnAsString)}`
        if (!status.match(flags.processPid)) {
            const endTime = (new Date()).getTime()
            const duration = endTime - startTime
            const humanReadableDuration = format(duration, { style: "full", ignoreZero: true })
            await bot.telegram.sendMessage({
                chat_id: chatId,
                text: `Your process ${flags.processName||flags.processPid} is finished!\nI watched it for ${humanReadableDuration}${lastObservedTime?`\nThis is what the OS had to say about duration: ${lastObservedTime}`:""}`
            })
            Deno.exit()
        } else {
            try {
                const rows = status.split("\n").filter(each=>each.length!=0).map(each=>each.trim().split(/[\s\t \n]+/g))
                if (rows.length > 1) {
                    const index = rows[0].indexOf("TIME")
                    lastObservedTime = rows[1][index]
                }
            } catch (error) {
                console.error(error)
            }
        }
    } catch (error) {
        console.error(error)
    }

}, flags.checkInterval-0)