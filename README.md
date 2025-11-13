# 🤖 Minimal TS Agent

> A lightweight TypeScript AI agent that can write files and execute code in a sandboxed environment.

**Because building an AI agent from scratch is easier than you think!** ┐(´д`)┌

## ✨ Features

- 🤖 **LLM-Powered**: Uses OpenRouter for multi-model support
- 📁 **Virtual Filesystem**: Safe, in-memory filesystem (10MB max)
- ⚡ **Code Execution**: Sandboxed JS/TS execution with vm2
- 💬 **Interactive CLI**: Beautiful terminal interface with colors and boxes
- 🔧 **Native Tool Calls**: Uses OpenRouter's native function calling (not custom JSON!)
- 🌊 **Real-time Streaming**: See responses and thinking traces as they happen
- 💬 **Agent Communication**: Agent can send messages to explain its work as it goes
- ✅ **Internal Todo List**: Agent manages its own task list autonomously
- 🎯 **Task Planning**: Breaks complex tasks into steps
- 🔄 **Iterative Debugging**: Agent tries to fix errors automatically
- 🛡️ **Security**: Sandboxed execution, no external imports allowed
- 💭 **Thinking Traces**: Watch the AI's reasoning process live (reasoning-enabled models)
- 💾 **Persistent Storage**: Auto-save/restore sessions with pluggable storage (fs, memory, redis, etc.)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (pas de NodeJS version 2015 stp 💀)
- An OpenRouter API key ([get one here](https://openrouter.ai/keys))

### Installation

```bash
# Install dependencies
npm install

# Install storage (optional but recommended)
npm install unstorage

# Copy environment template
cp .env.example .env

# Edit .env and add your OpenRouter API key
# OPENROUTER_API_KEY=your_key_here
```

### Running

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

## 📖 Usage

### Basic Interaction

```
You: Create a function to calculate fibonacci numbers

Agent: I'll create a TypeScript file with a Fibonacci calculator...
[Agent creates fib.ts]
[Agent executes the code]
```

### Special Commands

- `/help` - Show all available commands
- `/files` - List all files in virtual filesystem
- `/cat <file>` - Read a file
- `/delete <file>` - Delete a file
- `/project [name]` - Show or set current project name
- `/save [name]` - Save project to `workspace/` folder (real files!)
- `/load <name>` - Load project from `workspace/` folder
- `/stats` - Show agent statistics (including real-time costs, reasoning tokens, cached tokens)
- `/sessions` - List all saved sessions (storage)
- `/reset` - Clear everything and start fresh
- `/clear` - Clear screen
- `/exit` - Quit the agent

### Real-time Feedback ✨

The agent provides rich real-time feedback as it works:

- **🔄 Iteration counter** - Shows current step in the agentic loop (debug mode)
- **💭 Thinking traces** - See the AI's reasoning process as it happens (for reasoning-enabled models)
- **🌊 Streaming text** - Watch responses appear character by character
- **🔧 Tool execution** - Live feedback on which tools are being called
- **💬 Agent messages** - Agent explains what it's doing between actions
- **✅ Internal todo list** - Agent creates and checks off tasks as it works
- **✓/✗ Status indicators** - Immediate success/error feedback for each action
- **⏱️ Timing** - Execution time for each action
- **📊 Token usage** - Real-time token counts and costs after each LLM call

### Debug Mode

Enable detailed logging:

```bash
# In .env
DEBUG=true
```

Debug mode shows:
- Iteration numbers
- Tool call details (parameters, content previews)
- Execution timing (highlighted if >100ms)
- Tool outputs (truncated)

For EXTRA verbose (OpenAI SDK logs):
```bash
DEBUG=verbose
```

### How the Agent Works 🤖

When you give the agent a task, it:

1. **Plans** - Creates a todo list of what needs to be done
2. **Executes** - Works through tasks, using tools (write files, run code, etc.)
3. **Communicates** - Sends messages to explain progress
4. **Iterates** - Continues until all tasks are complete
5. **Summarizes** - Explains what it accomplished

Example workflow:
```
You: Create a calculator with tests

💭 Thinking...
Agent reasoning about the task...

🔧 Actions:

  ➤ ✅ add_todo: Create calculator functions
    ✓ Done (15ms)

  ➤ ✅ add_todo: Write unit tests
    ✓ Done (12ms)

  ➤ 📝 write_file: calculator.js
    ✓ Done (45ms)

💬 Response:
I've created the calculator with add, subtract, multiply, divide functions.

🔧 Actions:

  ➤ ✓ complete_todo: Create calculator functions
    ✓ Done (8ms)

  ➤ 📝 write_file: calculator.test.js
    ✓ Done (38ms)

  ➤ ▶️ execute_code: calculator.test.js
    ✓ Done (234ms)

💬 Response:
All tests passing! The calculator is ready to use with 4 operations and 8 passing tests!

📊 1247 tokens used
```

### Example Prompts

Try these to get started:

1. **Fibonacci Calculator**
   ```
   Create a Fibonacci function that returns the nth number and test it with n=10
   ```

2. **String Reverser**
   ```
   Write a function to reverse a string and test it with "Hello World"
   ```

3. **Web Page**
   ```
   Create a simple HTML page with CSS styling for a personal portfolio
   ```

4. **Todo List**
   ```
   Create a todo list data structure with methods to add, remove, and list tasks
   ```

5. **Calculator**
   ```
   Make a simple calculator with add, subtract, multiply, divide functions and test them
   ```

## ⚙️ Configuration

All configuration is done via environment variables in `.env`:

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-...

# Optional
DEFAULT_MODEL=anthropic/claude-3.5-sonnet
MAX_TOKENS=4096
TEMPERATURE=0.7
DEBUG=false

# Storage (persistent sessions)
STORAGE_ENABLED=true
STORAGE_DRIVER=fs
STORAGE_BASE_PATH=./.agent-storage

# Reasoning (for supported models)
REASONING_ENABLED=true
REASONING_EFFORT=medium
```

See `INSTALL_STORAGE.md` and `REASONING.md` for details.

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│         CLI Interface               │
│  (inquirer, chalk, ora, boxen)      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│          Agent Core                 │
│  • Memory Management                │
│  • LLM Communication (streaming)    │
│  • Tool Execution                   │
│  • Todo Management                  │
│  • Session Storage                  │
└────────────┬────────────────────────┘
             │
     ┌───────┴───────┐
     │               │
┌────▼─────┐   ┌────▼─────────┐
│  Virtual │   │     Code      │
│   FS     │   │   Executor    │
│ (memfs)  │   │    (vm2)      │
└──────────┘   └───────────────┘
```

## 🔧 Development

```bash
# Install dependencies
npm install

# Run in dev mode with auto-reload
npm run dev

# Build
npm run build

# Type check
npx tsc --noEmit
```

## 📦 Tech Stack

- **TypeScript** - Type-safe development
- **OpenRouter** - Multi-model LLM access (OpenAI SDK compatible)
- **memfs** - In-memory virtual filesystem
- **vm2** - Secure code sandbox
- **inquirer** - Interactive CLI prompts
- **chalk** - Terminal colors
- **ora** - Spinners
- **boxen** - Boxes around messages
- **zod** - Schema validation
- **unstorage** - Pluggable storage (optional)

## 🤝 Contributing

This is a minimal example project to demonstrate how to build an AI agent. Feel free to fork and extend it!

## 📄 License

MIT - Do whatever you want with it!

---

Built with ❤️ and a lot of sarcasm by Claude-sama 🏴‍☠️
