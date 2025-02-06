import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { type ChatCompletionContentPartImage } from "openai/resources/chat/completions";
import { PDFToImage } from "pdf-to-image-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const Profile = z.object({
  name: z.string(),
  contactInfo: z.object({
    email: z.string(),
    linkedInUrl: z.string(),
    phone: z.string(),
    twitterUrl: z.string(),
  }),
  currentTitle: z.string(),
  qualifications: z.array(z.string()),
});

async function convertPdfToJpegs(): Promise<string[]> {
  const outputDir = path.join(__dirname);

  const pdfPath = path.join(__dirname, "profile.pdf");

  // Initialize PDF converter
  const pdf = await new PDFToImage().load(pdfPath);

  // Set conversion options
  const options = {
    outputFolderName: outputDir,
    viewportScale: 2,
    imageType: "jpeg",
    includeBufferContent: true, // This will include image buffers in the result
  };

  // Convert PDF to images
  const result = await pdf.convert(options);

  // Extract base64 strings from the buffers
  const base64Images = result
    .map((pageOutput) => {
      if (pageOutput.content) {
        return pageOutput.content.toString("base64");
      }
      return "";
    })
    .filter((base64) => base64 !== "");

  // Clean up generated files
  await pdf.removeGeneratedImagesOnDisk();

  return base64Images;
}

async function main() {
  const base64Images = await convertPdfToJpegs();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant that extracts profile information from resumes. Please extract the name, contact information, and key qualifications.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please extract the profile information from this resume, including name, contact details, and key qualifications.",
          },
          // Add all base64 images to the request
          ...base64Images.map(
            (base64Image): ChatCompletionContentPartImage => ({
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            }),
          ),
        ],
      },
    ],
    response_format: zodResponseFormat(Profile, "profile"),
  });

  console.log("Extracted Profile Information:");
  console.log(response.choices[0].message.content);
}

main().catch((error) => {
  console.error("An error occurred:", error);
});
