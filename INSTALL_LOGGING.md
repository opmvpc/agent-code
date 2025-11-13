# Installation du système de logging 📝

## Installation

```bash
npm install winston
```

## Fonctionnalités

Le système de logging avec **winston** enregistre TOUT ce qui se passe dans l'agent:

- 🔧 **Tool calls**: Tous les tools demandés et exécutés
- 💭 **Thinking traces**: Les traces de raisonnement du LLM
- 📊 **LLM requests/responses**: Modèle, tokens, coûts
- ❌ **Erreurs**: Stack traces complètes
- ⏱️ **Timing**: Durée d'exécution des tools

## Fichiers de logs

Les logs sont automatiquement créés dans `logs/`:

- `logs/agent.log` - TOUS les logs (info, warning, error)
- `logs/errors.log` - Seulement les erreurs
- Rotation automatique (max 5MB par fichier, 5 fichiers max)

## Configuration

Variables d'environnement dans `.env`:

```bash
# Niveau de log (error, warn, info, debug)
LOG_LEVEL=info

# Pour voir aussi les logs dans la console
DEBUG=verbose
```

## Niveaux de log

```
error   - Erreurs critiques uniquement
warn    - Warnings + erreurs
info    - Infos + warnings + erreurs (DEFAULT)
debug   - Tout, y compris thinking traces
```

## Exemple de logs

```
[2025-11-13 14:30:45] INFO    | LLM request sent
{
  "model": "openai/gpt-oss-120b",
  "messageCount": 5,
  "reasoning": { "enabled": true, "effort": "high" }
}

[2025-11-13 14:30:47] INFO    | LLM requested 3 tool(s)
{
  "tools": ["write_file", "execute_code", "add_todo"]
}

[2025-11-13 14:30:47] INFO    | Executing tool: write_file
{
  "tool": "write_file",
  "arguments": {
    "filename": "test.js",
    "content": "console.log('Hello');"
  }
}

[2025-11-13 14:30:47] INFO    | Tool completed: write_file (5ms)

[2025-11-13 14:30:47] ERROR   | Tool execution failed: execute_code
{
  "tool": "execute_code",
  "arguments": { "filename": "test.js" },
  "error": "File not found",
  "stack": "Error: File not found\n    at ..."
}
```

## Inspection des logs

```bash
# Voir les logs en temps réel
tail -f logs/agent.log

# Voir seulement les erreurs
tail -f logs/errors.log

# Chercher un tool spécifique
grep "write_file" logs/agent.log

# Dernières 100 lignes
tail -n 100 logs/agent.log
```

## Debug avancé

Pour débugger un problème:

1. Mettre `LOG_LEVEL=debug` dans `.env`
2. Reproduire le bug
3. Checker `logs/agent.log` pour voir EXACTEMENT ce qui se passe
4. Les thinking traces montrent le raisonnement du LLM
5. Les tool calls montrent quels outils sont demandés/exécutés

## Rotation des logs

Winston gère automatiquement la rotation:
- Quand un fichier atteint 5MB → création d'un nouveau fichier
- Maximum 5 fichiers gardés (agent.log, agent.log.1, ..., agent.log.4)
- Les plus vieux sont automatiquement supprimés

## Performance

- Logging async (pas de ralentissement)
- Pas de logs en prod si `LOG_LEVEL=error`
- Compression automatique des anciens logs (TODO)

---

**Note**: Les logs contiennent des infos sensibles (API keys, contenu des fichiers).
Ne les commit JAMAIS! (déjà dans .gitignore)
