// src/tools/image-tools.ts
import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";
import { z } from "zod";
import logger from "../utils/logger.js";

const OPENROUTER_IMAGE_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image-preview";

const ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

type AspectRatio = (typeof ASPECT_RATIOS)[number];

export class ImageGenerationTool extends BaseTool {
  readonly name = "generate_image";
  readonly description =
    "Generate high quality images with OpenRouter's GPT-5 Image Mini. Provide a detailed ENGLISH prompt describing style, lighting, mood, colors, characters, and environment. The PNG file will be saved inside the virtual workspace, creating folders automatically if needed.";

  protected getParametersSchema() {
    return {
      properties: {
        prompt: {
          type: "string",
          description:
            "DETAILED English description of the desired image (style, lighting, mood, palette, characters, pose, camera angle, environment). Minimum 40 characters.",
        },
        filename: {
          type: "string",
          description:
            "Destination PNG path (e.g. images/car.png). Nested folders will be created automatically. Must be unique.",
        },
        aspect_ratio: {
          type: "string",
          enum: ASPECT_RATIOS,
          description:
            "Optional aspect ratio. Defaults to 1:1. Supported values: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9.",
        },
      },
      required: ["prompt", "filename"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    const parsed = this.buildArgsSchema(agent).safeParse(args);

    if (!parsed.success) {
      const errorMessages = parsed.error.errors
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ");
      return {
        success: false,
        error: errorMessages,
      };
    }

    const { prompt, filename, aspect_ratio } = parsed.data;

    try {
      const dataUrls = await this.fetchImageDataUrls(prompt, aspect_ratio);

      if (!dataUrls.length) {
        return {
          success: false,
          error: "Image generation API returned no image data.",
        };
      }

      const { buffer, mimeType } = this.decodeDataUrl(dataUrls[0]);

      if (mimeType !== "image/png") {
        throw new Error(`Model returned ${mimeType}, only PNG outputs are supported for now.`);
      }

      agent.getFileManager().saveFile(filename, buffer);
      agent.addLastAction(this.name, { filename, bytes: buffer.length });

      return {
        success: true,
        action: "generate_image",
        filename,
        size: buffer.length,
        mimeType,
        prompt,
        aspectRatio: aspect_ratio || "1:1",
        preview: `${dataUrls[0].substring(0, 120)}...`,
        note: "Binary PNG stored in the virtual filesystem. Use /files to inspect or export.",
      };
    } catch (error) {
      logger.error("[ImageGenerationTool] Failed to generate image", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        promptPreview: prompt.substring(0, 160),
        filename,
        aspect_ratio: aspect_ratio || "1:1",
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private buildArgsSchema(agent: Agent) {
    return z
      .object({
        prompt: z
          .string()
          .min(40, "Prompt must be at least 40 characters")
          .refine((value) => this.isEnglishPrompt(value), {
            message: "Prompt must be written in English with descriptive wording",
          }),
        filename: z
          .string()
          .min(5, "Filename is required")
          .regex(/\.png$/i, { message: "Filename must end with .png" })
          .transform((value) => this.normalizeFilename(value)),
        aspect_ratio: z.enum(ASPECT_RATIOS).optional(),
      })
      .superRefine((data, ctx) => {
        if (agent.getVFS().exists(data.filename)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `File already exists: ${data.filename}`,
            path: ["filename"],
          });
        }
      });
  }

  private normalizeFilename(raw: string): string {
    return raw
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/^((\.\.)\/)+/, "");
  }

  private decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid image payload returned by API");
    }

    const mimeType = match[1];
    const base64 = match[2];
    return {
      mimeType,
      buffer: Buffer.from(base64, "base64"),
    };
  }

  private isEnglishPrompt(prompt: string): boolean {
    const asciiOnly = /^[\x00-\x7F\s]+$/.test(prompt);
    const englishTokens = prompt.match(/[A-Za-z]{3,}/g)?.length ?? 0;
    return asciiOnly && englishTokens >= 8;
  }

  private async fetchImageDataUrls(
    prompt: string,
    aspectRatio?: AspectRatio
  ): Promise<string[]> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required to generate images.");
    }

    const response = await fetch(OPENROUTER_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_IMAGE_MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"],
        stream: false,
        image_config: aspectRatio ? { aspect_ratio: aspectRatio } : undefined,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("[ImageGenerationTool] OpenRouter image API failed", {
        status: response.status,
        bodyPreview: errorBody.substring(0, 1000),
      });
      throw new Error(
        `Image generation request failed (status ${response.status}). Check logs for details.`
      );
    }

    const data = (await response.json()) as any; // OpenRouter response is dynamic
    const images = data?.choices?.[0]?.message?.images;

    if (!Array.isArray(images) || images.length === 0) {
      logger.error("[ImageGenerationTool] No images returned by OpenRouter", {
        responsePreview: JSON.stringify(data).substring(0, 1000),
      });
      throw new Error("Image generation API returned no image data.");
    }

    const dataUrls = images
      .map(
        (image: any) =>
          image?.image_url?.url ||
          image?.imageUrl?.url ||
          image?.imageURL?.url
      )
      .filter((value: string | undefined): value is string => Boolean(value));

    if (dataUrls.length === 0) {
      logger.error(
        "[ImageGenerationTool] Image payload missing data URLs",
        { responsePreview: JSON.stringify(data).substring(0, 1000) }
      );
      throw new Error("Image generation API returned malformed data.");
    }

    return dataUrls;
  }
}
