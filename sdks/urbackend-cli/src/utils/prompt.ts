import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Prompts the user for a single line of input.
 * Automatically closes the readline interface after reading.
 */
export async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(question)).trim();
  rl.close();
  return answer;
}

/**
 * Prompts the user for secret input (like a password/token) without echoing characters.
 */
export async function promptSecret(question: string): Promise<string> {
  const rl = createInterface({
    input: stdin,
    output: stdout,
  });

  // Write the question first
  stdout.write(question);

  // Standard Node.js readline secret pattern using internal _writeToOutput override:
  const oldWrite = (rl as any)._writeToOutput;
  (rl as any)._writeToOutput = function _writeToOutput(stringToWrite: string) {
    if (stringToWrite === "\r" || stringToWrite === "\n" || stringToWrite === "\r\n") {
      oldWrite.call(rl, stringToWrite);
    } else if (stringToWrite === question) {
      oldWrite.call(rl, stringToWrite);
    } else {
      // Echo nothing or a mask (nothing is standard for non-echoing Unix style secret prompts)
    }
  };

  const answer = (await rl.question("")).trim();
  (rl as any)._writeToOutput = oldWrite;
  rl.close();
  return answer;
}

/**
 * Prompts for a yes/no confirmation.
 * Returns true for "y" or "yes" (case-insensitive), false otherwise.
 */
export async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} (y/n): `);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}
