## What is this?

Its a way to get a telegram notification when a process ends. Could be used for long-running processes or simple crash-detection. Currently designed for *nix machines, but would be easy to add windows support.

## How do I use it?

Install with:

```sh
deno install -n process_end_notifier -Af https://raw.githubusercontent.com/jeff-hykin/process_end_notifier/master/main.js 
```

Running with no arguments will step you through everything
```sh
process_end_notifier
>>>     If you don't have an auth token:
>>>     - go to https://t.me/botfather
>>>     - send a "/newbot" message 
>>>     - copy the token out of the response
>>> What's your AUTH token?
```

Alternatively with arguments:
```sh
process_end_notifier \
    --token YOUR_TOKEN \ 
    --chatName MyTelgramChatName \
    --processPid 40942 \
    --processName 'Experiment Number 541 - attempt 12'
```