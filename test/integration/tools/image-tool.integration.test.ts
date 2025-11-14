import { describe, it, expect } from "vitest";
import { ImageGenerationTool } from "../../../src/tools/image-tools.js";
import { VirtualFileSystem } from "../../../src/filesystem/virtual-fs.js";
import { FileManager } from "../../../src/filesystem/file-manager.js";
import type { Agent } from "../../../src/core/agent.js";

const API_KEY = process.env.OPENROUTER_API_KEY;
const describeOrSkip = API_KEY ? describe : describe.skip;

describeOrSkip("ImageGenerationTool integration", () => {
  it(
    "generates an actual PNG via OpenRouter",
    async () => {
      const vfs = new VirtualFileSystem();
      const fileManager = new FileManager(vfs);
      const tool = new ImageGenerationTool();

      const agentStub: Partial<Agent> = {
        getFileManager: () => fileManager,
        getVFS: () => vfs,
        addLastAction: () => undefined,
      };

      const prompt =
        "A playful kitten chasing butterflies in a field of lavender, cinematic lighting, high detail.";

      const result = await tool.execute(
        {
          prompt,
          filename: "images/integration-cat.png",
          aspect_ratio: "1:1",
        },
        agentStub as Agent
      );

      expect(result.success).toBe(true);
      expect(result.filename).toBe("images/integration-cat.png");

      const stored = vfs.readFileBuffer("images/integration-cat.png");
      expect(stored.length).toBeGreaterThan(0);
    },
    60_000
  );
});
