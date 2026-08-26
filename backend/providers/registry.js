class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(name, provider) {
    this.providers.set(name, provider);
  }

  get(name) {
    return this.providers.get(name);
  }

  isConfigured(name) {
    const provider = this.providers.get(name);
    return provider && provider.isConfigured();
  }

  getStatus() {
    const status = {};
    for (const [name, provider] of this.providers) {
      status[name] = {
        configured: provider.isConfigured(),
        name: provider.name || name,
      };
    }
    return status;
  }
}

const registry = new ProviderRegistry();
module.exports = registry;
