# 🤖 Minimal TS Agent

> A lightweight TypeScript AI agent that can write files and execute code in a sandboxed environment.

**Because building an AI agent from scratch is easier than you think!** ┐(´д`)┌

## ✨ Features

- 🤖 **LLM-Powered**: Uses OpenRouter for multi-model support
- 📁 **Virtual Filesystem**: Safe, in-memory filesystem (10MB max)
- ⚡ **Code Execution**: Sandboxed JS/TS execution with vm2
- 💬 **Interactive CLI**: Beautiful terminal interface with colors and boxes
- 🎯 **Task Planning**: Breaks complex tasks into steps
- 🔄 **Iterative Debugging**: Agent tries to fix errors automatically
- 🛡️ **Security**: Sandboxed execution, no external imports allowed

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (pas de NodeJS version 2015 stp 💀)
- An OpenRouter API key ([get one here](https://openrouter.ai/keys))

### Installation

```bash
# Install dependencies
npm install

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
- `/stats` - Show agent statistics
- `/reset` - Clear everything and start fresh
- `/clear` - Clear screen
- `/exit` - Quit the agent

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

## 🏗️ Architecture

```
📦 minimal-ts-agent/
├── 📁 src/
│   ├── 📁 core/          # Agent brain & memory
│   ├── 📁 filesystem/    # Virtual filesystem
│   ├── 📁 executor/      # Code execution sandbox
│   ├── 📁 cli/           # Terminal interface
│   ├── 📁 llm/           # OpenRouter integration
│   └── index.ts          # Entry point
├── 📁 config/            # Model configurations
└── .env                  # Environment variables
```

### Core Components

- **Agent** (`src/core/agent.ts`): Main orchestrator
- **Memory** (`src/core/memory.ts`): Conversation history
- **VirtualFileSystem** (`src/filesystem/virtual-fs.ts`): In-memory filesystem
- **CodeExecutor** (`src/executor/code-runner.ts`): Sandboxed code execution
- **OpenRouterClient** (`src/llm/openrouter.ts`): LLM communication

## 🔧 Configuration

### Environment Variables

```bash
# Required
OPENROUTER_API_KEY=your_key_here

# Optional - Basic Settings
DEFAULT_MODEL=openai/gpt-oss-120b          # Default model (try the FREE one! 🎉)
MAX_TOKENS=4096                            # Max tokens per response
TEMPERATURE=0.7                            # 0.0 = deterministic, 1.0 = creative
DEBUG=false                                # Enable debug logging

# Optional - Reasoning Settings (for Grok, GPT-5, GPT-OSS)
REASONING_ENABLED=true                     # Enable reasoning mode
REASONING_EFFORT=medium                    # low | medium | high (let AI decide token count)
REASONING_EXCLUDE=false                    # Exclude reasoning tokens from response
```

**Reasoning Settings Explained** 🧠:

- **low effort**: Quick thinking - AI decides optimal token count
- **medium effort**: Balanced reasoning (default) - AI allocates as needed
- **high effort**: Deep analysis - AI uses as many tokens as required
- **exclude**: If true, reasoning tokens won't appear in response (but still used internally)

**Note**: Token counts are managed automatically by the AI. Real costs are tracked via OpenRouter's Usage Accounting API! 💰

### Supported Models

Check `config/models.json` for available models. **Updated for 2025!** 🚀

#### 🎯 Recommended Models:

- **GPT-OSS 120B** 🆓 - FREE open source! Supports reasoning. Perfect for learning.
- **Grok 4 Fast** ⚡ - 2M context window! Supports reasoning. Can read entire codebases.
- **GPT-5 Nano** 💎 - Cheap GPT-5. Supports reasoning + web search.
- **Devstral Small** 🛠️ - Code-focused, no reasoning. Fast for simple tasks.

#### 🧠 Models with Reasoning Support:

Reasoning = model "thinks" before responding, like o1/o3 style.

- ✅ **GPT-OSS 120B** - Free reasoning!
- ✅ **Grok 4 Fast** - Best reasoning with huge context
- ✅ **GPT-5 Nano** - Balanced reasoning + web search
- ❌ **Devstral Small** - No reasoning (but fast)

**Pro tip**: Use `REASONING_EFFORT=high` for complex bugs, `low` for simple tasks!

## 🛡️ Security & Limitations

### Sandbox Restrictions

- ✅ Pure JavaScript/TypeScript only
- ✅ Basic built-ins: console, setTimeout, Array, Object, String, Number, JSON
- ❌ No `require()` or `import`
- ❌ No access to `fs`, `process`, `child_process`, etc.
- ❌ No `eval()` or `Function()` constructor
- ⏱️ 5 second timeout per execution
- 💾 128MB memory limit

### Filesystem Limits

- 10MB total storage
- 1MB max per file
- Supported extensions: `.js`, `.ts`, `.json`, `.txt`, `.md`, `.html`, `.css`

## 🎯 How It Works

1. **User Input** → You type a request
2. **LLM Processing** → Agent sends to OpenRouter
3. **Response Parsing** → Extracts actions (write file, execute code, etc.)
4. **Action Execution** → Performs actions in sandboxed environment
5. **Feedback Loop** → Shows results and can iterate on errors

### Response Format

The agent expects/generates responses in this JSON format:

```json
{
  "thought": "I'll create a fibonacci function...",
  "actions": [
    {
      "type": "write_file",
      "filename": "fib.ts",
      "content": "function fib(n: number): number { ... }"
    },
    {
      "type": "execute_code",
      "filename": "fib.ts"
    }
  ],
  "message": "Created and executed fibonacci calculator!"
}
```

## 🐛 Troubleshooting

### "API key not found"

Make sure you have a `.env` file with `OPENROUTER_API_KEY` set.

### "Rate limit exceeded"

OpenRouter has rate limits. Wait a few seconds and try again.

### "vm2 deprecation warning"

Yes, vm2 is deprecated but still works fine for this use case. We prioritize functionality over perfection (deal with it 🤷).

### Code execution fails

Check if your code:

- Has syntax errors
- Uses forbidden features (require, import, fs, etc.)
- Has infinite loops (5 second timeout)

## 📊 Stats & Monitoring

Use `/stats` to see **real-time** usage info:

- Number of files created
- Filesystem usage
- LLM requests and total tokens
- **Reasoning tokens** used (for thinking 🧠)
- **Cached tokens** (optimization ⚡)
- **Actual costs** from OpenRouter (not estimated!)

Example output:

```
LLM Usage:
  Requests        : 5
  Total Tokens    : 12,450
  Reasoning Tokens: 3,200
  Cached Tokens   : 1,100 ⚡
  Actual Cost     : $0.002340 🎉
```

## 🎓 Educational Use

This project is designed as a learning tool for:

- Building AI agents
- LLM integration patterns
- Sandboxed code execution
- CLI application development
- TypeScript best practices

Perfect for workshops, courses, or just understanding how AI agents work!

## 🤝 Contributing

This is a minimal example project. Feel free to:

- Fork it
- Extend it
- Break it
- Learn from it

No formal contribution process because this is meant to be simple and hackable.

## 📜 License

MIT - Do whatever you want with it (but don't blame me if it breaks 🤡)

## 🙏 Acknowledgments

- **vm2** - For sandboxing (RIP, you served us well)
- **OpenRouter** - For multi-model API access
- **memfs** - For virtual filesystem
- **inquirer** - For beautiful CLI prompts
- **chalk** - For colorful terminal output

## 💡 Tips & Tricks

1. **Start Simple**: Test with basic tasks first
2. **Be Specific**: Clear instructions = better results
3. **Iterate**: Let the agent fix its own errors
4. **Save Often**: Use `/save` to export your work
5. **Check Stats**: Monitor your API usage with `/stats`

---

**Built with 💚 and a healthy dose of cynicism by Claude-sama** (▀̿Ĺ̯▀̿ ̿)

_If this agent writes better code than you, that's a skill issue on your part fr fr_ 💀
