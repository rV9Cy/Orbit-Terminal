<div align="center">

![Orbit Terminal](assets/poster.svg)

# Orbit Terminal

A local web terminal with tabs, smooth animations and shareable sessions

English | [فارسی](README.md)

</div>

## About

Orbit is a web-based terminal that runs on your own machine. It needs no external service and has no dependencies. Node.js is all you need.

## Features

- Real shell (bash/sh on Linux, macOS and Termux; PowerShell on Windows)
- Multiple tabs with animated transitions
- Shareable sessions: give the link to someone on your network and work in the same terminal together
- File manager: browse device files, preview text, download, upload and open a folder in the terminal
- Vazirmatn and JetBrains Mono fonts bundled locally (works offline)
- Simple settings: switch the interface language (Persian / English)
- Zero dependencies, nothing to install

## Requirements

Node.js 18 or newer. Check your version:

```
node -v
```

## Install and run

```
git clone https://github.com/rV9Cy/Orbit-Terminal.git
cd Orbit-Terminal
node server.js
```

Then open `http://localhost:3000` in your browser.

### Running in different terminals

**Termux (Android)**

```
pkg update && pkg upgrade
pkg install nodejs git
git clone https://github.com/rV9Cy/Orbit-Terminal.git
cd Orbit-Terminal
node server.js
```

Open your phone browser and go to `http://localhost:3000`.

**Linux (Ubuntu / Debian)**

```
sudo apt update
sudo apt install nodejs git
cd Orbit-Terminal
node server.js
```

If your Node version is too old, use nvm or NodeSource.

**macOS**

```
brew install node git
cd Orbit-Terminal
node server.js
```

**Windows - PowerShell**

```
winget install OpenJS.NodeJS.LTS
cd Orbit-Terminal
node server.js
```

**Windows - CMD**

```
cd Orbit-Terminal
node server.js
```

**Windows - Git Bash or WSL**

Run it the same way as on Linux:

```
cd Orbit-Terminal
node server.js
```

### Changing the port and network access

By default it only listens on `127.0.0.1`. To change the port or open it to your network:

| Environment | Command |
|---|---|
| Linux / macOS / Termux / Git Bash | `PORT=4000 HOST=0.0.0.0 node server.js` |
| PowerShell | `$env:PORT=4000; $env:HOST="0.0.0.0"; node server.js` |
| CMD | `set PORT=4000 && set HOST=0.0.0.0 && node server.js` |

### Device files

The terminal starts in your home folder (prompt `local@orbit ~ >`) and `ls` lists the real files on the device. On Termux, run this once and allow the permission to reach phone storage:

```
termux-setup-storage
```

Then `cd ~/storage/shared` gives you the phone files (Download, DCIM and so on). On Windows, Linux and macOS, `cd` to any path the current user can access.

## Cancelling a running command

- Keyboard: press `Ctrl+C` (if text is selected, it only copies).
- Phone and touch screens: while a command is running, a red `Ctrl+C` button appears next to the input box.
- Cancelling stops the running program and everything it started, then opens a fresh shell in the same folder.
- Clear the screen: `clear` or `Ctrl+L`.

## Supported shells

The shell used inside Orbit depends on the operating system, not on the terminal you used to start the server:

| System | Default shell |
|---|---|
| Linux, macOS, Termux | the user shell (`$SHELL`) such as bash, zsh, fish or sh |
| Windows | PowerShell |

CMD commands such as `dir` and `cd` also work in PowerShell. For the rest use `cmd /c command`.

To pick a different shell, set the `ORBIT_SHELL` variable:

| Environment | Command |
|---|---|
| Linux / macOS / Termux / Git Bash | `ORBIT_SHELL=zsh node server.js` |
| PowerShell | `$env:ORBIT_SHELL="pwsh"; node server.js` |
| CMD | `set ORBIT_SHELL=pwsh && node server.js` |

The shell type is detected from its name: if it is `pwsh` or `powershell`, the PowerShell method is used, otherwise the POSIX method (bash style). Shells outside these two families, such as plain CMD, are untested.

## Limitations

Orbit is not a real terminal (PTY); it runs the shell over pipes. Normal commands such as `ls`, `git`, `npm`, `node` and `python script.py` work, but these do not work properly:

- Full-screen programs such as `vim`, `nano` and `htop`
- Programs that ask interactive questions, such as an `ssh` password prompt or running `python` without a file
- Output colors (color codes are stripped)

## Security warning

Orbit gives the user a real shell. If you set `HOST=0.0.0.0`, anyone who can reach that port can run commands on your machine. Only do this on a network you trust.

## Project structure

```
orbit-terminal/
  server.js        zero-dependency server
  public/          UI and fonts
  assets/          poster
```

## Support and contact

- Author: Arrow dev
- Donate: https://donate.sudoshz.ir/u/spidey_team
- Telegram channel: https://t.me/ArrowDeveloper

## License

MIT
