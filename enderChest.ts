/*_____           _            ____ _               _   
 | ____|_ __   __| | ___ _ __ / ___| |__   ___  ___| |_ 
 |  _| | '_ \ / _` |/ _ \ '__| |   | '_ \ / _ \/ __| __|
 | |___| | | | (_| |  __/ |  | |___| | | |  __/\__ \ |_ 
 |_____|_| |_|\__,_|\___|_|   \____|_| |_|\___||___/\__|
    written by @yeondu1062.
*/

import { LevelDB } from 'leveldb-zlib';
import { parse } from 'prismarine-nbt';
import { Select } from 'enquirer';
import path from 'path';
import os from 'os';
import fs from 'fs';

interface Choice {
  message: string;
  name: string;
}

interface Item {
  Count: { value: number },
  Name: { value: string }
}

const worldPath = path.join(
  os.homedir(),
  'AppData',
  'Local',
  'Packages',
  'Microsoft.MinecraftUWP_8wekyb3d8bbwe',
  'LocalState',
  'games',
  'com.mojang',
  'minecraftWorlds'
);

async function getWorldChoices(): Promise<Choice[]> {
  const folders = await fs.promises.readdir(worldPath, { withFileTypes: true });
  const worldChoices: Choice[] = [];

  for (const folder of folders.filter(f => f.isDirectory())) {
    const worldNamePath = path.join(worldPath, folder.name, 'levelname.txt');
    const worldName = await fs.promises.readFile(worldNamePath, 'utf8').catch(() => null);

    if (worldName == null) continue;
    worldChoices.push({ message: worldName.trim(), name: folder.name });
  }

  return worldChoices;
}

async function getPlayerChoices(worldDB: LevelDB): Promise<Choice[]> {
  const playerChoices: Choice[] = [{ message: '~local_player (본인)', name: '~local_player' }];

  for await (const [key] of worldDB.getIterator({ keyAsBuffer: false })) {
    if (key.includes('player_server_')) playerChoices.push({ message: key, name: key });
  }

  return playerChoices;
}

async function selectPlayer(playerChoices: Choice[]): Promise<string> {
  const prompt = new Select({
    name: 'player',
    message: '방향키로 플레이어를 선택해주세요.',
    choices: playerChoices
  });

  return prompt.run();
}

async function printEnderChest(worldDB: LevelDB, player: string): Promise<void> {
  const rawData = await worldDB.get(player);
  const { parsed } = await parse(rawData ?? Buffer.alloc(0));

  const inventory = parsed.value?.EnderChestInventory?.value?.value ?? [];
  const items: string[] = [];

  inventory.forEach((item: Item) => {
    const itemCount = item.Count.value;
    
    if (itemCount === 0) return;
    items.push(`${item.Name.value.replace('minecraft:', '')} (${itemCount})`);
  });

  if (items.length > 0) {
    console.log("\n엔더 상자에 있는 아이템 목록입니다.");
    items.forEach(item => console.log(item));
  } else { console.log("\n엔더 상자가 비어 있습니다."); }
}

function wait(): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write("\nENTER키를 눌러 다시 시작하거나 ESC키를 눌러 종료...");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', chunk => {
      process.stdin.setRawMode(false);
      process.stdin.pause();

      if (chunk[0] === 27) reject();
      else resolve();
    });
  });
}

async function main(): Promise<void> {
  while (true) {
    const worldChoices = await getWorldChoices();
    if (worldChoices.length === 0) {
      console.log('월드를 찾을 수 없습니다.');
      return;
    }

    const worldPrompt = new Select({
      name: 'world',
      message: '방향키로 월드를 선택해주세요.',
      choices: worldChoices
    });

    const world = await worldPrompt.run();
    const dbPath = path.join(worldPath, world, 'db');
    const worldDB = new LevelDB(dbPath, { createIfMissing: true });
    await worldDB.open();

    const player = await selectPlayer(await getPlayerChoices(worldDB));
    await printEnderChest(worldDB, player);
    await worldDB.close();
    await wait().catch(() => { console.log("\n프로그램을 종료합니다."); process.exit(0); });

    console.clear();
  }
}

main();
