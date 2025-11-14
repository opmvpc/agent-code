import { describe, it, expect, vi } from "vitest";
import { ImageGenerationTool } from "../../src/tools/image-tools.js";
import { VirtualFileSystem } from "../../src/filesystem/virtual-fs.js";
import { FileManager } from "../../src/filesystem/file-manager.js";
import type { Agent } from "../../src/core/agent.js";

describe("ImageGenerationTool", () => {
  it("generates and stores an image when the LLM returns data", async () => {
    const tool = new ImageGenerationTool();
    const vfs = new VirtualFileSystem();
    const fileManager = new FileManager(vfs);
    const addLastAction = vi.fn();

    const fakePng = Buffer.from("fake-cat-image");
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              images: [
                {
                  image_url: {
                    url: `data:image/png;base64,${fakePng.toString("base64")}`,
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    // @ts-expect-error - override for test
    globalThis.fetch = fetchMock;
    const previousKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    const agentStub: Partial<Agent> = {
      getFileManager: () => fileManager,
      addLastAction,
      getVFS: () => vfs,
    };

    const prompt =
      "A fluffy orange cat basking on a sunny windowsill, photorealistic lighting, soft shadows, cinematic depth of field.";
    try {
      const result = await tool.execute(
        {
          prompt,
          filename: "images/cat.png",
          aspect_ratio: "1:1",
        },
        agentStub as Agent
      );

      expect(result.success).toBe(true);
      expect(result.filename).toBe("images/cat.png");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/chat/completions",
        expect.objectContaining({ method: "POST" })
      );
      expect(addLastAction).toHaveBeenCalledWith("generate_image", expect.anything());

      const stored = vfs.readFileBuffer("images/cat.png");
      expect(stored.equals(fakePng)).toBe(true);
      expect(result.preview?.startsWith("data:image/png;base64,")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.OPENROUTER_API_KEY = previousKey;
    }
  });
});
