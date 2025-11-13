# 🔧 Environment Configuration Example

Copy this to your `.env` file and customize!

## Basic Setup (Minimal)

```bash
# Just the essentials - uses FREE model by default!
OPENROUTER_API_KEY=your_key_here
```

That's it! Will use `gpt-oss-120b` (free) with default settings.

## Recommended Setup

```bash
# 🔑 OpenRouter API Key (REQUIRED)
# Get it from: https://openrouter.ai/keys
OPENROUTER_API_KEY=your_key_here

# 🤖 Model Selection
DEFAULT_MODEL=openai/gpt-oss-120b

# ⚙️ Basic Settings
MAX_TOKENS=4096
TEMPERATURE=0.7
DEBUG=false

# 🧠 Reasoning Settings
REASONING_ENABLED=true
REASONING_EFFORT=medium
REASONING_EXCLUDE=false
```

## For Learning (FREE! 🎉)

```bash
OPENROUTER_API_KEY=your_key_here
DEFAULT_MODEL=openai/gpt-oss-120b
REASONING_ENABLED=true
REASONING_EFFORT=high  # Go crazy, it's free!
DEBUG=true             # Learn how it works
```

**Perfect for students and practice!**

## For Production (Best Performance)

```bash
OPENROUTER_API_KEY=your_key_here
DEFAULT_MODEL=x-ai/grok-4-fast
REASONING_ENABLED=true
REASONING_EFFORT=high
REASONING_EXCLUDE=true  # Cleaner output
MAX_TOKENS=8192
TEMPERATURE=0.5
```

**Grok with 2M context = can analyze huge codebases!**

## For Budget-Conscious Use

```bash
OPENROUTER_API_KEY=your_key_here
DEFAULT_MODEL=openai/gpt-5-nano
REASONING_ENABLED=true
REASONING_EFFORT=low  # Use less reasoning tokens
MAX_TOKENS=2048       # Limit output
```

**Good balance of cost and quality. Monitor with `/stats`!**

## For Speed (No Reasoning)

```bash
OPENROUTER_API_KEY=your_key_here
DEFAULT_MODEL=mistralai/devstral-small
# No reasoning settings = fast responses
MAX_TOKENS=4096
TEMPERATURE=0.7
```

**Fast and cheap for simple tasks!**

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | Your API key | `sk-or-v1-...` |

### Optional - Basic

| Variable | Description | Default |
|----------|-------------|---------|
| `DEFAULT_MODEL` | Model to use | `openai/gpt-oss-120b` |
| `MAX_TOKENS` | Max tokens per response | `4096` |
| `TEMPERATURE` | Creativity (0.0-1.0) | `0.7` |
| `DEBUG` | Show detailed logs | `false` |

### Optional - Reasoning

| Variable | Description | Options | Default |
|----------|-------------|---------|---------|
| `REASONING_ENABLED` | Enable reasoning mode | `true`/`false` | `false` |
| `REASONING_EFFORT` | Thinking depth | `low`/`medium`/`high` | N/A |
| `REASONING_EXCLUDE` | Hide reasoning tokens | `true`/`false` | `false` |

## Model Comparison

| Model | Context | Reasoning | Cost | Best For |
|-------|---------|-----------|------|----------|
| **gpt-oss-120b** | 131K | ✅ | FREE 🎉 | Learning |
| **grok-4-fast** | 2M | ✅ | $$$ | Production |
| **gpt-5-nano** | 400K | ✅ | $$ | Balanced |
| **devstral-small** | 128K | ❌ | $ | Speed |

## Cost Tracking

All costs are tracked in **real-time** via OpenRouter's Usage Accounting API!

Check anytime with:
```bash
/stats
```

Example output:
```
LLM Usage:
  Requests        : 10
  Total Tokens    : 25,840
  Reasoning Tokens: 5,200
  Cached Tokens   : 2,100 ⚡
  Actual Cost     : $0.004680
```

**No more guessing - actual costs from the API!** 💰

## Pro Tips 💡

1. **Start FREE**: Use `gpt-oss-120b` to learn
2. **Monitor costs**: Check `/stats` regularly
3. **Adjust effort**: Use `low` for simple tasks, `high` for complex ones
4. **Cache helps**: Repeated prompts = faster + cheaper (cached tokens)
5. **Debug mode**: Set `DEBUG=true` to understand what's happening

---

**Built with 💚 by Claude-sama**

*Now with REAL cost tracking, pas des estimations random! fr fr* 📊

