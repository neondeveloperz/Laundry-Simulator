# 🧺 Laundry Simulator

> A **desktop application** for simulating commercial laundry machine fleets, built with Tauri 2 + React 19 + Rust.  
> Designed for testing **Modbus RS-485** control systems without physical hardware.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-purple)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6)](https://www.typescriptlang.org)

---

## 📖 Overview

**Laundry Simulator** is a cross-platform desktop app that virtualizes a fleet of laundry machines (washers & dryers) communicating via **Modbus RTU over RS-485**. It enables developers and technicians to:

- Simulate machine states (Idle → Running → Completed → Error) in real-time
- Test RS-485/Modbus RTU communication without physical hardware
- Monitor Modbus registers, hex traffic, and event streams live
- Write and manage wash/dry programs using a built-in program editor
- Control simulation speed (1×, 2×, 5×, 10×) for fast-forward testing

---

## ✨ Features

| Feature | Description |
|---|---|
| 🖥️ **Fleet Dashboard** | Grid view of all machines with real-time state badges |
| ⚙️ **RS-485 Panel** | Configure and monitor Modbus RTU port settings |
| 📋 **Event Stream** | Live log viewer for all simulator events |
| 📊 **Register Monitor** | Inspect raw Modbus register values per machine |
| 🔢 **Hex Traffic Monitor** | View raw RS-485 byte traffic in hex dump format |
| 🧩 **Program Editor** | Create and assign wash/dry cycle programs |
| 🤖 **Virtual PLC** | Simulate a PLC device interacting with the fleet |
| ⚡ **Simulation Speed** | 1× / 2× / 5× / 10× time acceleration |
| 🌙 **Dark Mode** | Full dark/light theme support via `next-themes` |

---

## 🛠️ Tech Stack

### Frontend
- **React 19** + **TypeScript 5.9** (strict mode)
- **Vite 7** — lightning-fast dev server & bundler
- **Tailwind CSS 4** — utility-first styling
- **shadcn/ui** — accessible, composable UI components (Radix primitives)
- **@dnd-kit** — drag-and-drop for program editor
- **Recharts** — data visualization
- **Lucide React** — icon set

### Backend (Native)
- **Tauri 2** — Rust-powered desktop runtime
- **Rust** — native backend for serial port communication
- **serialport** crate — RS-485/Modbus serial I/O
- **chrono** — timestamp management

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Bun** | ≥ 1.x | [bun.sh](https://bun.sh) |
| **Rust** | ≥ 1.80 | [rustup.rs](https://rustup.rs) |
| **Node.js** | ≥ 20 (fallback) | [nodejs.org](https://nodejs.org) |

> **macOS only:** Install Xcode Command Line Tools: `xcode-select --install`  
> **Linux:** Install required system libs: `sudo apt install libwebkit2gtk-4.1-dev libssl-dev`  
> **Windows:** Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/neondeveloperz/Laundry-Simulator.git
cd Laundry-Simulator

# 2. Install frontend dependencies
bun install

# 3. Run in development mode (Tauri dev window)
bun run tauri dev
```

### Build for Production

```bash
# Compile and bundle the desktop app for your platform
bun run tauri build
```

The output installer/binary will be in `src-tauri/target/release/bundle/`.

---

### 🍎 macOS Gatekeeper / "App is damaged" Bypass

Since the macOS release is ad-hoc signed and not notarized with an Apple Developer Account ($99/year), you may encounter a Gatekeeper warning saying **"Laundry Simulator is damaged and can't be opened. You should move it to the Trash."** or similar block when downloading the app from GitHub.

You can easily bypass this using one of these options:

#### Option 1: Terminal (Fastest)
Open your Terminal and run the `xattr` command to remove the quarantine attribute:
```bash
# General command
xattr -cr /path/to/Laundry\ Simulator.app

# If the app is moved to your Applications folder
xattr -cr /Applications/Laundry\ Simulator.app
```
> [!TIP]
> You can type `xattr -cr ` in Terminal and drag the `Laundry Simulator.app` file from Finder directly into the Terminal window to auto-populate the correct path!

#### Option 2: Finder (GUI)
1. Open **Finder** and go to the folder containing the app.
2. **Right-click** (or `Ctrl` + click) on `Laundry Simulator.app` and choose **Open**.
3. A different confirmation dialog will appear with an **Open** or **Open Anyway** button.
4. Click **Open** to run. macOS will remember your decision, and you can open it normally via double-click in the future!

---

## 📁 Project Structure

```
Laundry-Simulator/
├── src/                          # React frontend
│   ├── App.tsx                   # Root component + routing logic
│   ├── components/
│   │   ├── machine/              # MachineCard, AddMachineCard
│   │   ├── modbus/               # Rs485Panel
│   │   ├── monitoring/           # EventStream, RegisterView, HexTraffic, etc.
│   │   └── ui/                   # shadcn/ui primitives
│   ├── hooks/                    # Custom React hooks (useToast, etc.)
│   ├── lib/                      # Tauri command bindings, utilities
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Helper functions
├── src-tauri/                    # Rust backend
│   ├── src/                      # Rust source (commands, modbus, simulator)
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri app configuration
├── data/                         # Static config / seed data
├── public/                       # Static web assets
└── package.json
```

---

## 🖥️ Available Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start Vite dev server (browser preview) |
| `bun run tauri dev` | Start full Tauri app with hot-reload |
| `bun run build` | Build frontend for production |
| `bun run tauri build` | Build native desktop installer |
| `bun run lint` | Run ESLint |
| `bun run format` | Format code with Prettier |
| `bun run typecheck` | Run TypeScript type-check (no emit) |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** this repository
2. **Create a branch**: `git checkout -b ✨-feature/your-feature-name`
3. **Commit your changes** following the commit convention below
4. **Push** to your fork: `git push origin ✨-feature/your-feature-name`
5. **Open a Pull Request** and describe what you've changed

### Commit Convention

```
✨ Feature: Add virtual PLC simulation module
🐛 Fix: Resolve Modbus timeout on port reconnect
♻️ Refactor: Split MachineCard into smaller components
⚡ Perf: Optimize register polling interval
📝 Docs: Update RS-485 setup instructions
```

### Code Style

- TypeScript **strict mode** is enforced
- Prettier + ESLint are pre-configured — run `bun run format` before committing
- Components follow the **shadcn/ui** composition pattern
- Rust code follows standard `cargo fmt` + `clippy` conventions

---

## 🐛 Reporting Issues

Please use [GitHub Issues](https://github.com/neondeveloperz/Laundry-Simulator/issues) with the following info:

- OS & version (macOS / Windows / Linux)
- App version (check `tauri.conf.json`)
- Steps to reproduce
- Expected vs. actual behavior
- Relevant logs from the Event Stream panel

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [Tauri](https://tauri.app) — for the lightweight, secure desktop runtime
- [shadcn/ui](https://ui.shadcn.com) — for the beautiful, accessible component system
- [dnd-kit](https://dndkit.com) — for the headless drag-and-drop toolkit
- [serialport-rs](https://github.com/serialport/serialport-rs) — for RS-485 serial communication in Rust
