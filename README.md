# Mobile Cocoa 🍫📱

Welcome to **Mobile Cocoa**! This repository is the mobile and backend ecosystem for "Vibe Coding Everywhere" – bringing advanced AI coding capabilities directly to your mobile device.

## 1. What Mobile Cocoa Does

Mobile Cocoa is a mobile-first intelligent coding assistant and development environment. It connects a sleek React Native (Expo) mobile interface to a powerful backend infrastructure. With Mobile Cocoa, you can:

- Discuss, design, and vibe-code software directly from your phone.
- Execute server-side operations, manage files, and interact with your development workspace seamlessly.
- Leverage LLM intelligence to build UI components, write full-stack code, and debug applications right from the palm of your hand.

<p align="center">
  <img src="docs/images/figure1.png" alt="Mobile Cocoa – Welcome Screen" width="300" />
</p>
<p align="center"><em>Figure 1: Mobile Cocoa in action — skill-powered chat interface.</em></p>

---

## 2. Start Up Guide

### Step 1 — Quick Start

Clone the repo, install dependencies, create a workspace sandbox, and install the Cloudflare tunnel tool — all in one go:

```bash
# 1. Clone & install
git clone https://github.com/your-org/mobile-cocoa.git
cd mobile-cocoa
npm install

# 2. Create a sandbox workspace (safe playground for the AI to read/write)
mkdir -p cocoa_workspace && cd cocoa_workspace && git init && cd ..

# 3. Install the Cloudflare tunnel (macOS)
#    For other platforms: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/
brew install cloudflared
```

---

### Step 2 — Install & Authenticate [Pi](https://github.com/badlogic/pi-mono)

Mobile Cocoa uses **Pi** (`@mariozechner/pi-coding-agent`) as the underlying CLI agent that connects to LLM providers. Pi is a minimal AI coding harness that equips LLMs with `read`, `write`, `edit`, and `bash` tools for terminal-based coding tasks.

```bash
# Install Pi globally
npm install -g @mariozechner/pi-coding-agent

# Authenticate — run pi and follow the interactive prompts
pi
```

Pi stores credentials in `~/.pi/agent/auth.json`. Mobile Cocoa automatically routes each request to the correct provider based on the model selected in the app — configured in `config/pi.json`.

| Pi CLI Provider        | What it covers                                                            |
| ---------------------- | ------------------------------------------------------------------------- |
| `anthropic`            | Claude models (`claude-*`, `claude-sonnet`, `claude-opus`, etc.)          |
| `google-gemini-cli`    | Gemini 2.x / 3.x preview models (`gemini-3.1-pro-preview`, etc.)         |
| `google-antigravity`   | Gemini 3 Pro low/high/flash variants                                      |
| `openai-codex`         | Codex models (`gpt-5.3-codex`, `gpt-5.1-codex-mini`, etc.)               |
| `openai`               | Standard GPT models (`gpt-4o`, etc.)                                     |

---

### Step 3 — Start in Cloudflare Mode

Run everything with one command:

```bash
npm run dev:cloudflare
```

This starts **three things** simultaneously:

- The proxy server (port 9443)
- The backend dev server (port 3456, with auto-restart)
- A Cloudflare quick tunnel

**Wait for the tunnel URL** — after a few seconds you'll see a highlighted box in your terminal:

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🚀  EXPO TUNNEL COMMAND — Ready!                       ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ Copy & run the command below in another terminal:      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

  EXPO_PUBLIC_SERVER_URL=https://xxx.trycloudflare.com npm run dev:mobile:cloudflare
```

**Copy and run the printed command** in a separate terminal, then **scan the QR code** on your phone — your app will now connect through the secure Cloudflare tunnel.

> ⚠️ **Before scanning:** Make sure your phone is connected to the **same Wi-Fi network** as the machine running Expo. This is required for the initial QR handshake. Once the app has loaded and connected through the Cloudflare tunnel, you can safely switch networks or disconnect from Wi-Fi on your phone.
>
> *Full remote access (no same-network requirement) is planned for a future phase.*

> **Note:** Quick tunnels are free and require no Cloudflare account, but they have no uptime guarantee. A new URL is generated each time you start the tunnel.

---

## 📖 Tutorial Guides

New to Mobile Cocoa? Follow these step-by-step tutorials in order to go from zero to vibe-coding on your phone:

| # | Guide | Description |
|---|-------|-------------|
| 1 | [Pi Setup Guide](quick_start/1.pi_setup_guide.md) | Install and authenticate **Pi**, the CLI agent that connects to LLM providers. |
| 2 | [Connect to Mobile](quick_start/2.connect_to_mobile_guide.md) | Start the server, launch the Cloudflare tunnel, and scan the QR code to connect your phone. |
| 3 | [Start Your First Mobile App](quick_start/3.start_your_first_mobile_app.md) | Select a skill, write a prompt, and watch the AI scaffold a full-stack project — all from your phone. |
| 4 | [Preview Project Frontend](quick_start/4.preview_project_frontend.md) | Render and preview your app's frontend in Mobile Cocoa's built-in browser. |
| 5 | [Session Management & Workspace Selection](quick_start/5.session_management_workspace_selection.md) | Manage parallel coding sessions and switch between project workspaces. |

> **Tip:** Each guide builds on the previous one. Start with **Pi Setup** and work your way through to get the full experience.

---

### 📚 Documentation References

For deeper architectural insights, see the `docs/` folder:

- `docs/server-session-registry.md` — how AI sessions, streaming states, and the LRU cache are managed.
- `docs/server-utils.md` — core utilities powering the server infrastructure.

---

### Why Mobile Cocoa is Great

**a. Skill-Driven Development & Low-Code Intelligence**
Mobile Cocoa utilizes a powerful skill-based architecture. It extends AI capabilities with predefined, specialized standard operating procedures ("skills" like UI/UX pro max, docker-expert, systematic-debugging, etc.). This makes it incredibly efficient at understanding complex tasks without requiring you to manually type a lot of boilerplate code from your phone.

**b. Unlimited Concurrent Sessions**
You can run as many parallel AI development sessions as possible. As long as you don't exceed your provider's rate limits/quotas, Mobile Cocoa scales with your ideas, allowing you to multi-task by spinning up distinct vibes for different components or servers simultaneously.

**c. Preview of Browser**
Tired of blind coding? Mobile Cocoa supports built-in browser previews, allowing you to see visual feedback of the web apps and UI components you and the AI are building in real-time, completely closing the feedback loop on mobile.

**d. Docker Integration**
Safety and consistency are paramount. Mobile Cocoa executes commands, sandboxes applications, and tests code within Docker containers. This means your local host environment is kept clean and safe, while providing a versatile and standardized Linux environment for the AI to work its magic.

---

## 🤝 Contributing

We welcome contributions of all kinds — bug fixes, features, or documentation improvements.

Please read our [Contribution Guidelines](CONTRIBUTING.md) before submitting a Pull Request or Issue.

### Quick Guide

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'feat: add amazing feature'`)
   - 🔍 Pre-commit hooks will automatically check your code for errors
   - Run `npm run lint:fix` to auto-fix common issues
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Code Quality

This project enforces code quality through automated pre-commit hooks:

- ✅ ESLint checks for unused imports/variables and coding standards
- ✅ TypeScript ensures type safety
- ✅ Commits are blocked if errors are found

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

Thank you to everyone who has contributed to Mobile Cocoa! 🙏

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 👥 Contributors

[@YifanXu1999](https://github.com/YifanXu1999) · [@Claude](https://github.com/Claude) · [@Cursor](https://github.com/Cursor) · [@Codex](https://github.com/Codex) · [@Antigravity](https://github.com/Antigravity)
