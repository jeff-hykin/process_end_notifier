import { Bot } from "https://deno.land/x/telegram@v0.1.1/mod.ts"

import { FileSystem, glob } from "https://deno.land/x/quickr@0.6.42/main/file_system.js"
import { Console, green } from "https://deno.land/x/quickr@0.6.42/main/console.js"
import { returnAsString, run, Stdout } from "https://deno.land/x/quickr@0.6.42/main/run.js"
import { recursivelyAllKeysOf, get, set, remove, merge, compareProperty } from "https://deno.land/x/good@1.4.4.2/object.js"
import { parse } from "https://deno.land/std@0.168.0/flags/mod.ts"
import { format } from "https://deno.land/std@0.198.0/fmt/duration.ts"

const defaultAuthTokenLocation = `${FileSystem.home}/.ssh/default_telegram_bot_token`
const envVarName = `DENO_TELEGRAM_BOT_TOKEN`

// 
// these are the only OS-specific functions
// 
const listProcessesWithName = async (name)=>(await run`ps -axww -o pid,command ${Stdout(returnAsString)}`).split("\n").filter(eachLine=>eachLine.match(name)).map(eachLine=>`    ${eachLine.split(/(?<!^)[ \t\s\n\r]+/).map((each,index)=>index==0?green(each):each).join(" ")}`).join("\n")
const processIsStillRunning = async (pid)=>(await run`ps ${`-p${pid}`} ${Stdout(returnAsString)}`).match(pid)
const maybeProcessDuration = async (pid)=>{
    const status = (await run`ps ${`-p${pid}`} ${Stdout(returnAsString)}`)
    try {
        const rows = status.split("\n").filter(each=>each.length!=0).map(each=>each.trim().split(/[\s\t \n]+/g))
        if (rows.length > 1) {
            const index = rows[0].indexOf("TIME")
            lastObservedTime = rows[1][index]
        }
        return lastObservedTime
    } catch (error) {
        console.error(error)
    }
}


// 
// basic CLI 
// 
    const stringOptions = ["token", "processPid", "chatName", "chatId", "checkInterval", "processName",]
    const booleanOptions = ["dontCacheToken"]
    const flags = parse(Deno.args, {
        boolean: ["help", ...booleanOptions],
        string: stringOptions, 
        default: {
            checkInterval: 5000, // miliseconds
        },
    })

    if (flags.help) {
        console.log(`
    NOTE: no arguments are required
        everything will be asked interactively
        (if not given as a argument)

    process_end_notifier ${stringOptions.map(each=>`\n      --${each} <string>`).join("")}${booleanOptions.map(each=>`\n      ${each}`).join("")}
        `)
        Deno.exit()
    }


// 
// AUTH token
// 
const defaultBotTokenPath = `${FileSystem.home}/.ssh/default_telegram_bot_token`
let token = flags.token || Deno.env.get(envVarName) || await FileSystem.read(defaultBotTokenPath)
if (!token) {
    console.log(`Note: I checked the ${envVarName} env var and didn't see a token there`)
    console.log(`Note: I went to ${JSON.stringify(defaultAuthTokenLocation)}, but I didn't see anything there either`)
    console.log(`
        If you don't have an auth token:
        - go to https://t.me/botfather
        - send a "/newbot" message 
        - copy the token out of the response message
    `)
    token = prompt("What's your AUTH token?")
    if (!flags.dontCacheToken) {
        FileSystem.write({
            path: defaultBotTokenPath,
            data: token,
        }).then(()=>{
            FileSystem.addPermissions({
                path: defaultBotTokenPath,
                permissions: {
                    owner: {
                        canExecute: 0,
                        canWrite: true,
                        canRead: true,
                    },
                    group: {
                        canExecute: 0,
                        canWrite: 0,
                        canRead: 0,
                    },
                    other: {
                        canExecute: 0,
                        canWrite: 0,
                        canRead: 0,
                    },
                }
            })
        })
    }
}

// 
// chat id
// 
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
            chatName = prompt(`Which chat would you like it to message?\nAvailable chats: ${Object.keys(chatNameToId).join(", ")}\n:`)
            chatId = (chatNameToId[chatName] || chatNameToId[chatName.trim()])-0
            if (!chatId) {
                console.log(`Sorry I didn't see that one. Try copying and pasting the name from the Available chats: ${JSON.stringify(Object.keys(chatNameToId))}`)
            }
        }
        console.log(`great, btw the chatId for that chat is: ${chatId}`)
    }
}


// 
// process id
// 
if (!flags.processPid) {
    const name = Console.askFor.line("Whats part of the name of the process? (or the whole name)")
    console.log("Here's the process information I have for that:")
    console.log(
        await listProcessesWithName(name)
    )
    flags.processPid = Console.askFor.line("What's the PID of the process you're looking for?")-0
}


// 
// actual watcher
// 
let lastObservedTime = 0
console.log(`Okay I am now watching: ${flags.processPid}`)
const startTime = (new Date()).getTime()
setInterval(async ()=>{
    try {
        if (!await processIsStillRunning(flags.processPid)) {
            const endTime = (new Date()).getTime()
            const duration = endTime - startTime
            const humanReadableDuration = format(duration, { style: "full", ignoreZero: true })
            await bot.telegram.sendMessage({
                chat_id: chatId,
                text: `Your process ${flags.processName||flags.processPid} is finished!\nI watched it for ${humanReadableDuration}${lastObservedTime?`\nThis is what the OS had to say about duration: ${lastObservedTime}`:""}`
            })
            Deno.exit()
        } else {
            lastObservedTime = await maybeProcessDuration(flags.processPid)
        }
    } catch (error) {
        console.error(error)
    }

}, flags.checkInterval-0)