# 🧠 Reasoning Mode Guide

## What is Reasoning?

Reasoning mode allows AI models to "think" before responding, similar to OpenAI's o1/o3 models. The model generates internal reasoning tokens to analyze the problem deeply before providing an answer.

**Benefits:**
- Better code quality
- Fewer bugs
- More thorough solutions
- Better understanding of complex problems

**Costs:**
- Uses more tokens (reasoning tokens count)
- Takes longer to respond
- More expensive (for paid models)

## Supported Models

| Model | Reasoning | Context | Cost | Best For |
|-------|-----------|---------|------|----------|
| GPT-OSS 120B | ✅ | 131K | FREE 🎉 | Learning, practice |
| Grok 4 Fast | ✅ | 2M | $0.20/$0.50 | Large codebases |
| GPT-5 Nano | ✅ | 400K | $0.05/$0.40 | Production use |
| Devstral Small | ❌ | 128K | $0.07/$0.28 | Quick tasks |

## Configuration

### Option 1: Environment Variables

Add to your `.env` file:

```bash
# Enable reasoning
REASONING_ENABLED=true

# Choose effort level (AI manages token count automatically)
REASONING_EFFORT=medium  # low | medium | high

# Optionally exclude reasoning from response
REASONING_EXCLUDE=false
```

**Note**: You don't need to specify max tokens! The AI intelligently allocates tokens based on effort level.

### Option 2: Programmatic

```typescript
import { Agent } from './core/agent.js';

const agent = new Agent({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'openai/gpt-oss-120b',
  reasoning: {
    enabled: true,
    effort: 'high',  // or maxTokens: 5000
    exclude: false,
  },
});
```

## Effort Levels

### Low Effort (~100-500 tokens)
**Use for:**
- Simple functions
- String manipulation
- Basic calculations
- Quick fixes

**Example:**
```bash
REASONING_EFFORT=low
```

```
You: Create a function to reverse a string
Agent: [thinks for ~200 tokens] Here's the solution...
```

### Medium Effort (~500-2000 tokens)
**Use for:**
- Multiple functions
- Data structures
- API integrations
- Moderate complexity

**Example:**
```bash
REASONING_EFFORT=medium  # This is the default
```

```
You: Build a todo list with add, remove, and search
Agent: [thinks for ~1000 tokens] I'll create a class...
```

### High Effort (~2000-10000 tokens)
**Use for:**
- Complex algorithms
- System design
- Debugging hard bugs
- Performance optimization

**Example:**
```bash
REASONING_EFFORT=high
```

```
You: Optimize this O(n²) algorithm for large datasets
Agent: [thinks for ~5000 tokens] Let me analyze the bottlenecks...
```

## How Effort Levels Work

The AI automatically manages token allocation based on your effort setting:

```bash
# Just set the effort level
REASONING_EFFORT=medium
```

**What happens:**
- **low**: AI uses ~100-500 reasoning tokens (quick thinking)
- **medium**: AI uses ~500-2000 reasoning tokens (balanced)
- **high**: AI uses ~2000-10000+ reasoning tokens (deep analysis)

The exact token count is determined by the AI based on problem complexity. You get charged for actual usage (tracked via OpenRouter's Usage Accounting API). 💰

## Excluding Reasoning Tokens

Set `REASONING_EXCLUDE=true` to hide reasoning from output:

```bash
REASONING_EXCLUDE=true
```

**Effect:**
- Model still thinks internally
- You only see the final answer
- Cleaner output
- Same quality, less verbose

## Examples

### Example 1: Free Reasoning for Learning

```bash
# .env
OPENROUTER_API_KEY=your_key
DEFAULT_MODEL=openai/gpt-oss-120b
REASONING_ENABLED=true
REASONING_EFFORT=high
```

Perfect for students! Free reasoning with good quality.

### Example 2: Production with Grok

```bash
# .env
OPENROUTER_API_KEY=your_key
DEFAULT_MODEL=x-ai/grok-4-fast
REASONING_ENABLED=true
REASONING_EFFORT=medium
REASONING_EXCLUDE=true
```

Powerful reasoning, huge context, clean output.

### Example 3: Budget-Conscious

```bash
# .env
OPENROUTER_API_KEY=your_key
DEFAULT_MODEL=openai/gpt-5-nano
REASONING_ENABLED=true
REASONING_EFFORT=low  # Use less reasoning tokens
```

Good reasoning with cost control. Monitor with `/stats` to track actual costs!

### Example 4: Fast Mode (No Reasoning)

```bash
# .env
OPENROUTER_API_KEY=your_key
DEFAULT_MODEL=mistralai/devstral-small
# No reasoning settings = fast responses
```

Quick and cheap for simple tasks.

## Cost Comparison

For 1000 requests with 1000 reasoning tokens each:

| Model | Input Cost | Output Cost | Reasoning Cost | Total |
|-------|------------|-------------|----------------|-------|
| GPT-OSS | $0 | $0 | $0 | **$0** 🎉 |
| GPT-5 Nano | $50 | $400 | $50 | **$500** |
| Grok 4 | $200 | $500 | $200 | **$900** |
| Devstral | $70 | $280 | N/A | **$350** (no reasoning) |

**Takeaway**: Practice with GPT-OSS for free, then upgrade for production!

## Best Practices

### DO ✅

- Use `high` effort for complex problems
- Use `low` effort for simple tasks
- Test with free GPT-OSS first
- Set `exclude=true` for cleaner output
- Monitor token usage with `/stats`

### DON'T ❌

- Use `high` effort for everything (wastes tokens)
- Forget to enable reasoning in .env
- Use reasoning models without enabling reasoning
- Ignore token costs in production
- Worry about token limits (AI handles it!)

## Troubleshooting

### "Model doesn't support reasoning"

Solution: Check `config/models.json` - only Grok, GPT-5, and GPT-OSS support it.

### "Too expensive!"

Solutions:
1. Use free GPT-OSS
2. Lower effort: `medium` → `low`
3. Set `maxTokens` limit
4. Switch to non-reasoning model

### "Responses are slow"

Expected! Reasoning takes time. Solutions:
1. Lower effort level
2. Use `exclude=true` (slightly faster)
3. Switch to non-reasoning model for simple tasks

### "Not seeing improvement"

Tips:
1. Make sure `REASONING_ENABLED=true`
2. Try `high` effort for complex problems
3. Check model actually supports reasoning
4. Some tasks don't benefit from reasoning

## FAQ

**Q: Is reasoning worth it?**
A: For complex problems, yes! For "hello world", no.

**Q: Which effort should I use?**
A: Start with `medium`, increase for harder problems.

**Q: Does Devstral support reasoning?**
A: No, but it's fast and cheap for code.

**Q: Can I change reasoning per request?**
A: Not yet in this version. It's global via .env.

**Q: Can I set a max token limit for reasoning?**
A: No need! The AI manages tokens based on effort level. Use `/stats` to monitor actual usage.

---

**Built with 🧠 by Claude-sama**

*Remember: Thinking before coding = fewer bugs. Even for AI! fr fr* ᕕ( ᐛ )ᕗ
