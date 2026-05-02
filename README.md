# Epaminondas

A browser-based implementation of the abstract strategy board game invented by Robert Abbott (1975). Play locally or online with a friend anywhere in the world by sharing a single link.

## Requirements

- Python 3 (standard library only — no pip installs)
- A modern web browser
- SSH (built into Windows 10+, macOS, Linux) for internet play

## Play

```
python start.py
```

The browser opens automatically. For online play, the script attempts to create a public tunnel via `localhost.run` and prints a shareable URL in the terminal.

## GitHub Pages

This repository includes a GitHub Pages workflow for the static site. Pages supports **local play, AI play, and tutorials**. Online multiplayer still requires running `python start.py` locally.

To publish the site:

1. Enable GitHub Pages in repo settings and set **Build and deployment** to **GitHub Actions**.
2. Push to `main` (or run the workflow manually).

## Online Multiplayer

1. Run `python start.py` — note the `https://xxxxx.localhost.run` URL printed in the terminal
2. Click **Host Online Game** — a room code and full link appear
3. Send the link to your friend
4. Your friend opens the link and joins automatically

All game traffic routes through your machine via the SSH tunnel. No accounts, no cloud services, no cost.

> If the tunnel fails (SSH unavailable or firewall blocks it), LAN play still works — both players connect to the local network IP printed in the terminal.

## Rules

Epaminondas is played on a **14×12 board**. Each player starts with 28 pieces on their two back rows (White on the bottom, Black on the top). White moves first.

**Single piece** — moves one square in any direction (like a chess king). Cannot capture.

**Phalanx** — two or more same-color pieces in an unbroken straight line (horizontal, vertical, or diagonal). A phalanx moves *along its own axis* up to N squares, where N is the number of pieces in it.

**Capture** — a phalanx can capture an enemy phalanx directly ahead if the enemy group is *strictly smaller*. All captured pieces are removed.

**Win** — at the start of your turn, if you have more pieces on your opponent's back row than they have on yours, you win.

## Game Modes

| Mode | How to start |
|------|-------------|
| Local 2-Player | Both players share one computer |
| Host Online | You run the server; friend joins via link |
| Join by Code | Enter the 8-character room code |
| Tutorial | 10 guided steps with interactive practice |

## Project Structure

```
start.py        Python HTTP server + SSH tunnel (no dependencies)
index.html      Single-page app entry point
css/style.css
js/
  game.js       Rules engine (board, moves, captures, win detection)
  renderer.js   Canvas board rendering and animation
  ui.js         Screen management and interaction
  network.js    SSE + HTTP multiplayer client
  tutorial.js   Tutorial step definitions and preset boards
```
