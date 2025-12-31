import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

console.log("Key prefix:", process.env.OPENAI_API_KEY?.slice(0, 15));
console.log("Key len:", process.env.OPENAI_API_KEY?.length);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY?.trim(),
});

async function main() {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "dot product kya hota hai?" }],
  });

  console.log(res.choices[0].message.content);
}

main();
