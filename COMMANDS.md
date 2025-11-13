# 📚 Agent Commands Reference

## Quick Start

Just type naturally! The agent understands plain English.

**Example:**
```
You: Create a simple HTML page with CSS
Agent: [creates index.html and styles.css]
```

## Special Commands

All commands start with `/` - type them in the chat interface.

### 📋 Information Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Show all available commands + tips | `/help` |
| `/files` or `/ls` | List all files in virtual filesystem | `/files` |
| `/stats` | Show detailed statistics (tokens, costs, files) | `/stats` |

### 📁 File Management Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/cat <file>` | Read and display a file | `/cat index.html` |
| `/delete <file>` | Delete a file | `/delete old.js` |
| `/project [name]` | Show or set project name | `/project my-app` |
| `/save [name]` | Save project to workspace/ folder | `/save my-website` |
| `/load <name>` | Load project from workspace/ | `/load my-website` |

### 🔧 System Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/clear` | Clear the screen | `/clear` |
| `/reset` | Reset filesystem and memory (fresh start) | `/reset` |
| `/export [path]` | Export conversation memory | `/export memory.json` |
| `/exit` or `/quit` | Exit the agent | `/exit` |

## Supported File Types

The agent can create and manage these file types:

| Extension | Type | Icon | Can Execute? |
|-----------|------|------|--------------|
| `.js` | JavaScript | 📜 | ✅ Yes |
| `.ts` | TypeScript | 📘 | ✅ Yes |
| `.html` | HTML | 🌐 | ❌ No (storage only) |
| `.css` | CSS | 🎨 | ❌ No (storage only) |
| `.json` | JSON | 📋 | ❌ No |
| `.md` | Markdown | 📝 | ❌ No |
| `.txt` | Text | 📄 | ❌ No |

**Note**: Only JavaScript and TypeScript can be executed in the sandbox. HTML/CSS/etc. are stored in the virtual filesystem but can't be rendered.

## Usage Examples

### Example 1: Create and Execute Code

```
You: Write a function that calculates the factorial of a number

Agent: [creates factorial.js]
Agent: [executes factorial.js]
Agent: Output: factorial(5) = 120 ✅
```

### Example 2: Create Web Files

```
You: Create a landing page with HTML and CSS

Agent: [creates index.html]
Agent: [creates styles.css]
Agent: Message: Created landing page files! Use /cat to view them.
```

### Example 3: Manage Files

```
You: /files
Agent: [shows file tree]

You: /cat index.html
Agent: [displays HTML content with syntax highlighting]

You: /project my-website
Agent: ✅ Project renamed to: my-website

You: /save
Agent: 💾 Project saved to: workspace/my-website/
       3 file(s) exported
       Full path: C:\path\to\agent-code\workspace\my-website\
```

### Example 4: Check Usage

```
You: /stats
Agent:
📊 Agent Statistics

Filesystem:
  Files      : 5
  Size       : 12.45 KB
  Usage      : 0.1%

LLM Usage:
  Requests        : 10
  Total Tokens    : 25,840
  Reasoning Tokens: 5,200 🧠
  Cached Tokens   : 2,100 ⚡
  Actual Cost     : $0.004680
```

## Tips & Tricks 💡

### 1. Natural Language

Don't overthink it! Just ask naturally:

✅ **Good:**
- "Create a todo list in TypeScript"
- "Make the HTML prettier"
- "Fix the bug in calculator.js"

❌ **Unnecessary:**
- "Please use the write_file action to create..."
- "Execute the following JSON structure..."

### 2. Multi-file Projects

Ask for complete projects:

```
You: Build a personal portfolio website with HTML, CSS, and a JavaScript contact form
```

The agent will create:
- `index.html` - Main page
- `styles.css` - Styling
- `contact.js` - Form logic

### 3. Iterative Development

The agent remembers context:

```
You: Create a calculator in TypeScript
Agent: [creates calculator.ts]

You: Add a square root function
Agent: [updates calculator.ts with sqrt()]

You: Now test it
Agent: [executes calculator.ts]
```

### 4. Debugging

If code fails, just ask to fix it:

```
Agent: ❌ Error: ReferenceError: x is not defined

You: Fix the error
Agent: [updates code with proper variable declaration]
```

### 5. Save Your Work

Before major changes or experiments:

```
You: /project calculator
Agent: ✅ Project renamed to: calculator

You: /save
Agent: 💾 Project saved to: workspace/calculator/
       5 file(s) exported

You: Now refactor the entire codebase to use async/await
```

If something breaks:

```
You: /reset
You: /load calculator
Agent: 📥 Project loaded: calculator
       5 file(s) imported
```

Your files are now in `workspace/calculator/` - you can open them in your editor!

## Command Aliases

Some commands have shortcuts:

| Full Command | Alias |
|--------------|-------|
| `/files` | `/ls` |
| `/cat` | `/read` |
| `/delete` | `/rm` |
| `/exit` | `/quit` |

## Error Messages

### "File not found"
The file doesn't exist. Use `/files` to see all files.

### "Invalid file extension"
You tried to create a file type that's not supported. See supported types above.

### "Filesystem full"
You've hit the 10MB limit. Use `/delete` to remove old files.

### "Execution timeout"
Your code ran for more than 5 seconds. Check for infinite loops!

### "API key invalid"
Your OpenRouter API key is wrong or missing. Check your `.env` file.

## Best Practices

1. **Use `/help` when stuck** - Full help with examples
2. **Check `/stats` regularly** - Monitor token usage and costs
3. **Use `/save` often** - Backup before big changes
4. **Use `/clear`** - Clean up your screen when cluttered
5. **Use `/reset`** - Fresh start when things get messy

## Advanced Usage

### Chaining Actions

The agent can do multiple things:

```
You: Create calculator.js with basic operations, then test it
Agent: [creates file] → [executes file] → [shows results]
```

### File Organization

Create structured projects:

```
You: Create a project with index.html, css/styles.css, and js/app.js
Agent: [creates files in organized structure]
```

### Context Awareness

The agent remembers:
- All files you've created
- Previous execution results
- Your conversation history (last 10 messages)

```
You: Create utils.js with a helper function
Agent: ✅ Created utils.js

You: Now use it in the calculator
Agent: [updates calculator.js to import from utils.js - wait, no imports allowed!]
Agent: [copies the helper function into calculator.js instead] ✅
```

## Keyboard Shortcuts

While typing:

- `Ctrl+C` - Exit the agent (shows stats)
- `Up Arrow` - Not available (would be nice though!)
- `Tab` - Standard terminal autocomplete

## Getting Help

1. **In-app**: Type `/help`
2. **Documentation**: Check `README.md`
3. **Reasoning guide**: Check `REASONING.md` for AI thinking modes
4. **Environment setup**: Check `ENV_EXAMPLE.md`

---

**Built with 💚 by Claude-sama** (▀̿Ĺ̯▀̿ ̿)

*Maintenant va créer des trucs au lieu de lire la doc! 🚀*
