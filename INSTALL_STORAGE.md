# Installation du système de storage

Pour installer unstorage et ses drivers:

```bash
npm install unstorage
```

C'est tout! 🎉

## Configuration

Dans `.env`:

```bash
# Storage configuration
STORAGE_ENABLED=true
STORAGE_DRIVER=fs              # fs, memory
STORAGE_BASE_PATH=./.agent-storage  # Pour fs driver
```

## Drivers disponibles

### Filesystem (Node.js)
```bash
STORAGE_DRIVER=fs
STORAGE_BASE_PATH=./.agent-storage
```

### Memory (temporaire)
```bash
STORAGE_DRIVER=memory
```

### Futurs drivers possibles
- Redis
- Cloudflare KV
- Vercel KV
- MongoDB
- etc.

Il suffit d'implémenter l'interface `StorageDriver`!
