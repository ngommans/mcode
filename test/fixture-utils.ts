import fs from 'node:fs/promises';

export async function loadFixture<T = unknown>(name: string): Promise<T> {
  const data = await fs.readFile(`test/fixtures/${name}`, 'utf8');
  return JSON.parse(data) as T;
}
